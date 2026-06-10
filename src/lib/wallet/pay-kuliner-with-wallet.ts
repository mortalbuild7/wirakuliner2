import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDineInAddress } from "@/lib/order-channel";
import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import { isStoreOpen } from "@/lib/merchant-open";
import {
  applyPromoCode,
  computeDeliveryFeeServer,
  fetchServerSidePrices,
} from "@/lib/order-pricing";
import {
  checkFoodServiceAvailability,
  SERVICE_UNAVAILABLE_MSG,
} from "@/lib/service-area";
import { sanitizePublicText } from "@/lib/security/sanitize";
import { isValidUuid } from "@/lib/security/validate";
import type { PayKulinerWithWalletInput } from "@/lib/wallet/wallet-payment-schemas";

export type WalletPayResult =
  | {
      ok: true;
      orderId: string;
      amountCharged: number;
      deliveryFee: number;
      distanceKm: number;
      walletTxId: string;
      driversNotified: boolean;
    }
  | { ok: false; error: string; status?: number };

type RpcPayPayload = {
  ok?: boolean;
  order_id?: string;
  amount?: number;
  wallet_tx_id?: string;
};

/**
 * Inti pembayaran kuliner via saldo — dipanggil dari Server Action.
 *
 * Lapisan keamanan:
 * 1. `customerId` dari `getUser()` — bukan body request
 * 2. Harga dari `products.price` + markup Rp 1.000/unit (server)
 * 3. Insert order `pending_payment` dengan total server-side
 * 4. RPC `wallet_pay_pending_order` — FOR UPDATE order + wallet atomik
 */
export async function executeKulinerWalletPayment(
  admin: SupabaseClient,
  customerId: string,
  input: PayKulinerWithWalletInput
): Promise<WalletPayResult> {
  if (!isValidUuid(input.merchantId)) {
    return { ok: false, error: "Toko tidak valid", status: 400 };
  }

  const lineInputs = input.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));

  const { data: merchant, error: merchantErr } = await admin
    .from("merchants")
    .select(
      "id, name, latitude, longitude, is_open, is_active, admin_suspended, service_city_id"
    )
    .eq("id", input.merchantId)
    .single();

  if (merchantErr || !merchant) {
    return { ok: false, error: "Toko tidak ditemukan", status: 404 };
  }

  if (!merchant.is_active || merchant.admin_suspended) {
    return { ok: false, error: "Toko tidak aktif", status: 403 };
  }

  if (!isStoreOpen(merchant)) {
    return { ok: false, error: "Toko sedang tutup", status: 403 };
  }

  const dineIn = input.dineIn === true;
  const deliveryAddress = dineIn
    ? formatDineInAddress(merchant.name)
    : sanitizePublicText(input.deliveryAddress, 500);

  const deliveryLat = dineIn ? merchant.latitude : input.deliveryLat;
  const deliveryLng = dineIn ? merchant.longitude : input.deliveryLng;

  if (!deliveryAddress || deliveryLat == null || deliveryLng == null) {
    return { ok: false, error: "Alamat dan lokasi GPS wajib diisi", status: 400 };
  }

  let pricedLines;
  try {
    pricedLines = await fetchServerSidePrices(admin, input.merchantId, lineInputs);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Produk tidak valid",
      status: 400,
    };
  }

  let promo;
  try {
    promo = await applyPromoCode(admin, input.promoCode, pricedLines);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Promo tidak valid",
      status: 400,
    };
  }

  const serviceArea = await checkFoodServiceAvailability(
    admin,
    merchant,
    deliveryLat,
    deliveryLng,
    dineIn
  );

  if (!serviceArea.available) {
    return {
      ok: false,
      error: serviceArea.message ?? SERVICE_UNAVAILABLE_MSG,
      status: 403,
    };
  }

  let deliveryFee = 0;
  let distanceKm = 0;

  try {
    const fee = computeDeliveryFeeServer(
      merchant.latitude,
      merchant.longitude,
      merchant.name,
      deliveryLat,
      deliveryLng,
      dineIn
    );
    deliveryFee = fee.deliveryFee;
    distanceKm = fee.distanceKm;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal menghitung ongkir",
      status: 400,
    };
  }

  const orderTotal = promo.subtotalAfter + deliveryFee;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: customerId,
      merchant_id: input.merchantId,
      total_product_amount: promo.subtotalAfter,
      merchant_product_amount: promo.merchantProductTotal,
      platform_markup_amount: promo.platformMarkupTotal,
      delivery_fee: deliveryFee,
      is_outside_radius: false,
      negotiation_status: "none",
      order_status: "pending_payment",
      delivery_address: deliveryAddress,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      distance_km: distanceKm,
      service_city_id: serviceArea.cityId,
      payment_method: "wallet",
      payment_gateway: "wallet",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return {
      ok: false,
      error: orderError?.message ?? "Gagal membuat pesanan",
      status: 500,
    };
  }

  const orderId = order.id as string;

  const { error: itemsError } = await admin.from("order_items").insert(
    pricedLines.map((p) => ({
      order_id: orderId,
      product_id: p.productId,
      quantity: p.quantity,
      price: p.unitPrice,
      merchant_unit_price: p.merchantUnitPrice,
      product_name: p.name,
    }))
  );

  if (itemsError) {
    await admin.from("orders").delete().eq("id", orderId);
    return {
      ok: false,
      error: itemsError.message ?? "Gagal menyimpan item pesanan",
      status: 500,
    };
  }

  const { data: payData, error: payError } = await admin.rpc("wallet_pay_pending_order", {
    p_customer_id: customerId,
    p_order_id: orderId,
  });

  if (payError) {
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);

    const msg = payError.message ?? "Gagal membayar dengan saldo";
    const insufficient =
      msg.includes("Saldo tidak mencukupi") || msg.includes("tidak mencukupi");

    return {
      ok: false,
      error: insufficient ? "Saldo tidak mencukupi" : msg,
      status: insufficient ? 402 : 400,
    };
  }

  const payload = (payData ?? {}) as RpcPayPayload;
  const amountCharged = Number(payload.amount ?? orderTotal);
  const walletTxId = String(payload.wallet_tx_id ?? "");

  const notify = await notifyDriversNewOrder(orderId);

  return {
    ok: true,
    orderId,
    amountCharged,
    deliveryFee,
    distanceKm,
    walletTxId,
    driversNotified: !("skipped" in notify && notify.skipped),
  };
}
