import {
  deliveryZoneCenter,
  distanceToZone,
  FLAT_DELIVERY_FEE_IDR,
  isWithinDeliveryZone,
} from "@/lib/geo-config";
import { formatDineInAddress } from "@/lib/order-channel";
import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import { startOrderNegotiation } from "@/lib/start-nego";
import { isStoreOpen } from "@/lib/merchant-open";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

type LineItem = {
  productId?: string;
  quantity?: number;
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
    distanceKm?: number;
    isOutsideRadius?: boolean;
    accuracyM?: number | null;
    dineIn?: boolean;
    skipPayment?: boolean;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;
  const merchantId = body.merchantId;
  if (!isValidUuid(merchantId)) {
    return secureJsonResponse({ error: "Toko tidak valid" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .filter((i) => i && isValidUuid(i.productId))
    .map((i) => ({
      productId: i.productId!,
      quantity: parseBoundedNumber(i.quantity, 1, 99) ?? 0,
      price: parseBoundedNumber(i.price, 0, 50_000_000) ?? 0,
      name: sanitizeText(i.name, 120) ?? "Produk",
    }))
    .filter((i) => i.quantity > 0);

  if (!items.length || items.length > 50) {
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
    .select("id, name, latitude, longitude, is_open, is_active, admin_suspended")
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

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const zone = deliveryZoneCenter(merchant.latitude, merchant.longitude, merchant.name);
  const distanceKm = dineIn
    ? 0
    : (parseBoundedNumber(body.distanceKm, 0, 500) ??
      distanceToZone(deliveryLat, deliveryLng, zone.lat, zone.lng));
  const accuracyM = body.accuracyM ?? null;

  const withinZone = dineIn
    ? true
    : isWithinDeliveryZone(
        deliveryLat,
        deliveryLng,
        accuracyM,
        undefined,
        zone.lat,
        zone.lng
      );

  const outside = !dineIn && body.isOutsideRadius === true && !withinZone;
  const deliveryFee = dineIn ? 0 : outside ? 0 : FLAT_DELIVERY_FEE_IDR;
  const skipPayment =
    body.skipPayment === true || process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true";

  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: user.id,
      merchant_id: merchantId,
      total_product_amount: subtotal,
      delivery_fee: deliveryFee,
      is_outside_radius: outside,
      negotiation_status: outside ? "negotiating" : "none",
      order_status: "pending_payment",
      delivery_address: deliveryAddress,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      distance_km: distanceKm,
      payment_gateway: skipPayment ? "test_bypass" : "midtrans",
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

  if (outside) {
    const nego = await startOrderNegotiation(order.id, accuracyM);
    if ("error" in nego) {
      return secureJsonResponse({ error: nego.error }, { status: nego.status });
    }

    if (nego.corrected && nego.withinRadius) {
      await admin
        .from("orders")
        .update({
          is_outside_radius: false,
          negotiation_status: "none",
          delivery_fee: FLAT_DELIVERY_FEE_IDR,
          order_status: "paid",
          distance_km: distanceKm,
        })
        .eq("id", order.id);

      await notifyDriversNewOrder(order.id);

      return secureJsonResponse({
        ok: true,
        orderId: order.id,
        paid: true,
        outside: false,
        driversNotified: true,
      });
    }

    return secureJsonResponse({
      ok: true,
      orderId: order.id,
      paid: false,
      outside: true,
      driversNotified: (nego.driversNotified ?? 0) > 0,
      negotiationsCreated: nego.negotiationsCreated ?? 0,
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
      outside: false,
      driversNotified: !("skipped" in notify && notify.skipped),
    });
  }

  return secureJsonResponse({
    ok: true,
    orderId: order.id,
    paid: false,
    outside: false,
    needsPayment: true,
  });
}
