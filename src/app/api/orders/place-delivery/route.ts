import { deliveryZoneCenter, distanceToZone } from "@/lib/geo-config";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import { formatDineInAddress } from "@/lib/order-channel";
import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import { isStoreOpen } from "@/lib/merchant-open";
import {
  checkFoodServiceAvailability,
  SERVICE_UNAVAILABLE_MSG,
} from "@/lib/service-area";
import { debitCustomerForOrder } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { fetchServerSidePrices, computeSubtotal } from "@/lib/order-pricing";
import { detectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import { isValidUuid, parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

type LineItem = {
  productId?: string;
  quantity?: number;
  /** DIABAİKAN — harga diambil server-side dari tabel products (anti tampering) */
  price?: number;
  name?: string;
};

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-place-delivery", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    merchantId?: string;
    items?: LineItem[];
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    accuracyM?: number | null;
    dineIn?: boolean;
    skipPayment?: boolean;
    paymentMethod?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const idorMsg = detectTrustedOwnerIdsInBody(parsed.data as Record<string, unknown>);
  if (idorMsg) {
    return secureJsonResponse({ error: idorMsg }, { status: 403 });
  }

  const body = parsed.data;
  const merchantId = body.merchantId;
  if (!isValidUuid(merchantId)) {
    return secureJsonResponse({ error: "Toko tidak valid" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const lineInputs = rawItems
    .filter((i) => i && isValidUuid(i.productId))
    .map((i) => ({
      productId: i.productId!,
      quantity: parseBoundedNumber(i.quantity, 1, 99) ?? 0,
    }))
    .filter((i) => i.quantity > 0);

  if (!lineInputs.length || lineInputs.length > 50) {
    return secureJsonResponse({ error: "Keranjang kosong atau tidak valid" }, { status: 400 });
  }

  const dineIn = body.dineIn === true;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return secureJsonResponse({ error: "Silakan login sebagai customer" }, { status: 401 });
  }

  const { data: merchant, error: merchantErr } = await supabase
    .from("merchants")
    .select(
      "id, name, latitude, longitude, is_open, is_active, admin_suspended, service_city_id"
    )
    .eq("id", merchantId)
    .single();

  if (merchantErr || !merchant) {
    return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
  }

  if (!merchant.is_active || merchant.admin_suspended) {
    return secureJsonResponse({ error: "Toko tidak aktif" }, { status: 403 });
  }

  if (!isStoreOpen(merchant)) {
    return secureJsonResponse({ error: "Toko sedang tutup" }, { status: 403 });
  }

  const deliveryAddress = dineIn
    ? formatDineInAddress(merchant.name)
    : sanitizeText(body.deliveryAddress, 500);
  const deliveryLat = dineIn
    ? merchant.latitude
    : parseBoundedNumber(body.deliveryLat, -90, 90);
  const deliveryLng = dineIn
    ? merchant.longitude
    : parseBoundedNumber(body.deliveryLng, -180, 180);

  if (!deliveryAddress || deliveryLat == null || deliveryLng == null) {
    return secureJsonResponse({ error: "Alamat dan lokasi GPS wajib diisi" }, { status: 400 });
  }

  const admin = createAdminClient();

  let pricedLines;
  try {
    pricedLines = await fetchServerSidePrices(admin, merchantId, lineInputs);
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Produk tidak valid" },
      { status: 400 }
    );
  }

  const items = pricedLines.map((p) => ({
    productId: p.productId,
    quantity: p.quantity,
    price: p.unitPrice,
    name: p.name,
  }));

  const serviceArea = await checkFoodServiceAvailability(
    admin,
    merchant,
    deliveryLat ?? merchant.latitude,
    deliveryLng ?? merchant.longitude,
    dineIn
  );
  if (!serviceArea.available) {
    return secureJsonResponse(
      { error: serviceArea.message ?? SERVICE_UNAVAILABLE_MSG },
      { status: 403 }
    );
  }

  const subtotal = computeSubtotal(pricedLines);
  const zone = deliveryZoneCenter(merchant.latitude, merchant.longitude, merchant.name);

  if (!dineIn && !zone) {
    return secureJsonResponse(
      { error: "Toko belum memiliki koordinat GPS. Hubungi merchant." },
      { status: 400 }
    );
  }

  const distanceKm = dineIn
    ? 0
    : distanceToZone(deliveryLat, deliveryLng, zone!.lat, zone!.lng);
  const deliveryFee = dineIn ? 0 : calculateDeliveryFee(distanceKm);
  const orderTotal = subtotal + deliveryFee;
  const useWallet = body.paymentMethod === "wallet";
  const skipPayment =
    !useWallet &&
    (body.skipPayment === true || process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true");

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: user.id,
      merchant_id: merchantId,
      total_product_amount: subtotal,
      delivery_fee: deliveryFee,
      is_outside_radius: false,
      negotiation_status: "none",
      order_status: "pending_payment",
      delivery_address: deliveryAddress,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      distance_km: distanceKm,
      service_city_id: serviceArea.cityId,
      payment_method: useWallet ? "wallet" : "gateway",
      payment_gateway: useWallet ? "wallet" : skipPayment ? "test_bypass" : "midtrans",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return secureJsonResponse(
      { error: orderError?.message ?? "Gagal membuat pesanan" },
      { status: 500 }
    );
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      quantity: i.quantity,
      price: i.price,
      product_name: i.name,
    }))
  );

  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return secureJsonResponse(
      { error: itemsError.message ?? "Gagal menyimpan item pesanan" },
      { status: 500 }
    );
  }

  if (useWallet) {
    try {
      await debitCustomerForOrder(admin, user.id, orderTotal, order.id);
    } catch (e) {
      await admin.from("orders").delete().eq("id", order.id);
      return secureJsonResponse(
        { error: e instanceof Error ? e.message : "Gagal membayar dengan saldo" },
        { status: 400 }
      );
    }

    const { error: payError } = await admin
      .from("orders")
      .update({
        order_status: "paid",
        snap_token: `WALLET_${order.id}`,
      })
      .eq("id", order.id);

    if (payError) {
      return secureJsonResponse(
        { error: payError.message ?? "Gagal mengonfirmasi pembayaran saldo" },
        { status: 500 }
      );
    }

    const notify = await notifyDriversNewOrder(order.id);
    return secureJsonResponse({
      ok: true,
      orderId: order.id,
      paid: true,
      deliveryFee,
      distanceKm,
      paymentMethod: "wallet",
      driversNotified: !("skipped" in notify && notify.skipped),
    });
  }

  if (skipPayment) {
    const { error: payError } = await admin
      .from("orders")
      .update({
        order_status: "paid",
        snap_token: `BYPASS_${order.id}`,
      })
      .eq("id", order.id);

    if (payError) {
      return secureJsonResponse(
        { error: payError.message ?? "Gagal mengonfirmasi pembayaran uji" },
        { status: 500 }
      );
    }

    const notify = await notifyDriversNewOrder(order.id);

    return secureJsonResponse({
      ok: true,
      orderId: order.id,
      paid: true,
      deliveryFee,
      distanceKm,
      driversNotified: !("skipped" in notify && notify.skipped),
    });
  }

  return secureJsonResponse({
    ok: true,
    orderId: order.id,
    paid: false,
    deliveryFee,
    distanceKm,
    needsPayment: true,
  });
}
