import { haversineKm } from "@/lib/geo-config";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import { formatNgojekAddress } from "@/lib/order-channel";
import { notifyDriversNewOrder } from "@/lib/notify-drivers";
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

async function resolveHubMerchantId(admin: ReturnType<typeof createAdminClient>) {
  const envId = process.env.NGOJEK_HUB_MERCHANT_ID;
  if (envId && isValidUuid(envId)) {
    const { data } = await admin
      .from("merchants")
      .select("id")
      .eq("id", envId)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data } = await admin
    .from("merchants")
    .select("id")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .eq("admin_suspended", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-place-ride", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    pickupAddress?: string;
    destinationAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
    destinationLat?: number;
    destinationLng?: number;
    skipPayment?: boolean;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;
  const pickupAddress = sanitizeText(body.pickupAddress, 300);
  const destinationAddress = sanitizeText(body.destinationAddress, 300);
  const pickupLat = parseBoundedNumber(body.pickupLat, -90, 90);
  const pickupLng = parseBoundedNumber(body.pickupLng, -180, 180);
  const destinationLat = parseBoundedNumber(body.destinationLat, -90, 90);
  const destinationLng = parseBoundedNumber(body.destinationLng, -180, 180);

  if (
    !pickupAddress ||
    !destinationAddress ||
    pickupLat == null ||
    pickupLng == null ||
    destinationLat == null ||
    destinationLng == null
  ) {
    return secureJsonResponse(
      { error: "Titik jemput, tujuan, dan koordinat GPS wajib diisi" },
      { status: 400 }
    );
  }

  const distanceKm = haversineKm(pickupLat, pickupLng, destinationLat, destinationLng);
  if (distanceKm < 0.05) {
    return secureJsonResponse(
      { error: "Titik jemput dan tujuan terlalu dekat" },
      { status: 400 }
    );
  }

  const rideFee = calculateDeliveryFee(distanceKm);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return secureJsonResponse({ error: "Silakan login sebagai customer" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hubMerchantId = await resolveHubMerchantId(admin);
  if (!hubMerchantId) {
    return secureJsonResponse(
      { error: "Layanan NGOJEK belum tersedia. Hubungi admin." },
      { status: 503 }
    );
  }

  const deliveryAddress = formatNgojekAddress(pickupAddress, destinationAddress);
  const skipPayment =
    body.skipPayment === true || process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true";

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: user.id,
      merchant_id: hubMerchantId,
      total_product_amount: 0,
      delivery_fee: rideFee,
      is_outside_radius: false,
      negotiation_status: "none",
      order_status: "pending_payment",
      delivery_address: deliveryAddress,
      delivery_lat: destinationLat,
      delivery_lng: destinationLng,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      distance_km: distanceKm,
      payment_gateway: skipPayment ? "test_bypass" : "midtrans",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return secureJsonResponse(
      { error: orderError?.message ?? "Gagal membuat pesanan NGOJEK" },
      { status: 500 }
    );
  }

  const { error: itemsError } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: null,
    quantity: 1,
    price: 0,
    product_name: "NGOJEK Ride",
  });

  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return secureJsonResponse(
      { error: itemsError.message ?? "Gagal menyimpan detail ride" },
      { status: 500 }
    );
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
        { error: payError.message ?? "Gagal mengonfirmasi pembayaran" },
        { status: 500 }
      );
    }

    const notify = await notifyDriversNewOrder(order.id);

    return secureJsonResponse({
      ok: true,
      orderId: order.id,
      paid: true,
      rideFee,
      distanceKm,
      driversNotified: !("skipped" in notify && notify.skipped),
    });
  }

  return secureJsonResponse({
    ok: true,
    orderId: order.id,
    paid: false,
    rideFee,
    distanceKm,
    needsPayment: true,
  });
}
