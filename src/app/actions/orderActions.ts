"use server";

/**
 * ALUR HARGA & PROMO — Server Actions (Anti Parameter Tampering)
 *
 * Keamanan:
 * - Harga diambil dari tabel `products` via service role / server query.
 * - Frontend HANYA mengirim productId, quantity, promoCode.
 * - Total, ongkir, dan diskon dihitung di sini — tidak pernah percaya angka dari client.
 *
 * Transit multi-layanan (NGOJEK / NGOMOBIL / PAKET):
 * - `createTransitOrder` — validasi Zod superRefine PAKET, tarif regional server-side,
 *   insert atomik orders + order_package_details via RPC.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createTransitOrderSchema } from "@/lib/admin/order-transit-schemas";
import { haversineKm } from "@/lib/geo-config";
import {
  formatDineInAddress,
  formatTransitAddressByService,
} from "@/lib/order-channel";
import { isStoreOpen } from "@/lib/merchant-open";
import { NGOJEK_MAX_DISTANCE_KM, NGOJEK_MIN_DISTANCE_KM } from "@/lib/ngojek-ride-logic";
import {
  applyPromoCode,
  computeDeliveryFeeServer,
  fetchServerSidePrices,
  type OrderLineInput,
} from "@/lib/order-pricing";
import {
  computeTransitFareFromTariff,
  fetchRegionalTransitTariff,
  resolveRegionalIdsFromServiceCity,
} from "@/lib/regional-transit-pricing";
import { evaluateRideMatchingContext } from "@/lib/ride-matching";
import { checkRideServiceAvailability, checkServiceAvailability } from "@/lib/service-area";
import { computePackageVolumeCm3 } from "@/lib/service-types";
import { detectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import { sanitizePublicText } from "@/lib/security/sanitize";
import { isValidUuid, parseBoundedNumber } from "@/lib/security/validate";

export type CreateOrderInput = {
  merchantId: string;
  items: OrderLineInput[];
  promoCode?: string;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  dineIn?: boolean;
};

export type CreateOrderResult =
  | {
      ok: true;
      subtotal: number;
      discount: number;
      deliveryFee: number;
      total: number;
      pricedLines: Awaited<ReturnType<typeof fetchServerSidePrices>>;
    }
  | { ok: false; error: string };

/**
 * Menghitung total pesanan di server — dipanggil sebelum insert order
 * atau untuk preview checkout yang aman.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const idorMsg = detectTrustedOwnerIdsInBody(input as unknown as Record<string, unknown>);
  if (idorMsg) {
    return { ok: false, error: idorMsg };
  }

  if (!isValidUuid(input.merchantId)) {
    return { ok: false, error: "Toko tidak valid" };
  }

  const lines = (input.items ?? [])
    .filter((i) => i && isValidUuid(i.productId))
    .map((i) => ({
      productId: i.productId,
      quantity: parseBoundedNumber(i.quantity, 1, 99) ?? 0,
    }))
    .filter((i) => i.quantity > 0);

  if (!lines.length || lines.length > 50) {
    return { ok: false, error: "Keranjang tidak valid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Silakan login" };
  }

  const admin = createAdminClient();

  const { data: merchant } = await admin
    .from("merchants")
    .select("id, name, latitude, longitude, is_open, is_active, admin_suspended")
    .eq("id", input.merchantId)
    .maybeSingle();

  if (!merchant || !merchant.is_active || merchant.admin_suspended) {
    return { ok: false, error: "Toko tidak tersedia" };
  }

  if (!isStoreOpen(merchant)) {
    return { ok: false, error: "Toko sedang tutup" };
  }

  try {
    const pricedLines = await fetchServerSidePrices(admin, input.merchantId, lines);
    const promo = await applyPromoCode(admin, input.promoCode, pricedLines);

    const dineIn = input.dineIn === true;
    const deliveryLat = dineIn
      ? merchant.latitude
      : parseBoundedNumber(input.deliveryLat, -90, 90);
    const deliveryLng = dineIn
      ? merchant.longitude
      : parseBoundedNumber(input.deliveryLng, -180, 180);

    if (deliveryLat == null || deliveryLng == null) {
      return { ok: false, error: "Koordinat antar wajib diisi" };
    }

    const { deliveryFee } = computeDeliveryFeeServer(
      merchant.latitude,
      merchant.longitude,
      merchant.name,
      deliveryLat,
      deliveryLng,
      dineIn
    );

    const total = promo.subtotalAfter + deliveryFee;

    return {
      ok: true,
      subtotal: promo.subtotalBefore,
      discount: promo.discountAmount,
      deliveryFee,
      total,
      pricedLines,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal menghitung pesanan",
    };
  }
}

/** Helper: alamat aman untuk insert order. */
export async function sanitizeDeliveryAddress(
  merchantName: string,
  raw?: string,
  dineIn?: boolean
): Promise<string | null> {
  if (dineIn) return formatDineInAddress(merchantName);
  return sanitizePublicText(raw, 500);
}

export type CreateTransitOrderResult =
  | {
      ok: true;
      orderId: string;
      deliveryFee: number;
      distanceKm: number;
      totalVolumeCm3: number;
      serviceType: "NGOJEK" | "NGOMOBIL" | "PAKET";
    }
  | { ok: false; error: string };

async function resolveTransitHubMerchantId(
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
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

/**
 * Pengajuan pesanan transit multi-layanan — NGOJEK, NGOMOBIL, PAKET.
 * Harga final & volume dihitung server; insert all-or-nothing via RPC.
 */
export async function createTransitOrder(
  raw: unknown
): Promise<CreateTransitOrderResult> {
  const idorMsg = detectTrustedOwnerIdsInBody(
    (raw ?? {}) as Record<string, unknown>
  );
  if (idorMsg) return { ok: false, error: idorMsg };

  const parsed = createTransitOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid" };
  }

  const input = parsed.data;
  const distanceKm = haversineKm(
    input.pickupLat,
    input.pickupLng,
    input.destinationLat,
    input.destinationLng
  );

  if (distanceKm < NGOJEK_MIN_DISTANCE_KM) {
    return { ok: false, error: "Titik jemput dan tujuan terlalu dekat" };
  }
  if (distanceKm > NGOJEK_MAX_DISTANCE_KM) {
    return {
      ok: false,
      error: `Jarak maksimal layanan ${NGOJEK_MAX_DISTANCE_KM} km`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Silakan login" };

  const admin = createAdminClient();

  const isTransit =
    input.serviceType === "NGOJEK" || input.serviceType === "NGOMOBIL";

  const matchingCtx = isTransit
    ? await evaluateRideMatchingContext(
        admin,
        input.pickupLat,
        input.pickupLng,
        input.destinationLat,
        input.destinationLng,
        input.serviceType === "NGOMOBIL" ? "NGOMOBIL" : "NGOJEK"
      )
    : null;

  if (isTransit && matchingCtx && !matchingCtx.available) {
    return {
      ok: false,
      error: matchingCtx.message ?? "Layanan tidak tersedia di wilayah ini",
    };
  }

  const serviceArea =
    isTransit && matchingCtx
      ? {
          available: matchingCtx.available,
          message: matchingCtx.message,
          cityId: matchingCtx.serviceCityId ?? matchingCtx.operationalClusterId,
          cityName: matchingCtx.serviceCityName ?? matchingCtx.pickupProvinceName,
        }
      : await checkRideServiceAvailability(
          admin,
          input.pickupLat,
          input.pickupLng,
          input.destinationLat,
          input.destinationLng,
          input.serviceType
        );

  if (!serviceArea.available) {
    return {
      ok: false,
      error: serviceArea.message ?? "Layanan tidak tersedia di wilayah ini",
    };
  }

  const operationalClusterId = matchingCtx?.operationalClusterId ?? null;

  const nearestServiceCity = isTransit
    ? await checkServiceAvailability(admin, input.pickupLat, input.pickupLng)
    : serviceArea;

  const serviceCityIdForOrder =
    nearestServiceCity.cityId ?? matchingCtx?.serviceCityId ?? serviceArea.cityId;

  const pickupProvinceId =
    matchingCtx?.pickupProvinceId ??
    (await resolveRegionalIdsFromServiceCity(admin, serviceCityIdForOrder)).provinceId;

  const borderSurcharge = matchingCtx?.borderSurcharge ?? 0;
  const isBorderlineCrossing = matchingCtx?.isBorderlineCrossing ?? false;
  const matchingMode = matchingCtx?.matchingMode ?? null;

  const hubMerchantId = await resolveTransitHubMerchantId(admin);
  if (!hubMerchantId) {
    return { ok: false, error: "Layanan transit belum tersedia. Hubungi admin." };
  }

  const { provinceId, cityId } = await resolveRegionalIdsFromServiceCity(
    admin,
    serviceCityIdForOrder
  );

  const tariffProvinceId = provinceId ?? pickupProvinceId;
  const tariff =
    tariffProvinceId != null
      ? await fetchRegionalTransitTariff(
          admin,
          tariffProvinceId,
          cityId,
          input.serviceType
        )
      : null;
  const deliveryFee =
    computeTransitFareFromTariff(tariff, distanceKm) + borderSurcharge;

  const totalVolumeCm3 =
    input.serviceType === "PAKET" && input.packageDetails
      ? computePackageVolumeCm3(
          input.packageDetails.lengthCm,
          input.packageDetails.widthCm,
          input.packageDetails.heightCm
        )
      : 0;

  const deliveryAddress = formatTransitAddressByService(
    input.serviceType,
    input.pickupAddress,
    input.destinationAddress
  );

  const orderPayload = {
    customer_id: user.id,
    merchant_id: hubMerchantId,
    total_product_amount: 0,
    delivery_fee: deliveryFee,
    is_outside_radius: false,
    negotiation_status: "none",
    order_status: "pending_payment",
    delivery_address: deliveryAddress,
    delivery_lat: input.destinationLat,
    delivery_lng: input.destinationLng,
    pickup_lat: input.pickupLat,
    pickup_lng: input.pickupLng,
    distance_km: distanceKm,
    service_city_id: serviceCityIdForOrder,
    operational_cluster_id: operationalClusterId,
    pickup_province_id: pickupProvinceId,
    is_borderline_crossing: isBorderlineCrossing,
    border_surcharge: borderSurcharge,
    matching_mode: matchingMode,
    province_id: tariffProvinceId,
    city_id: cityId,
    service_type: input.serviceType,
    total_volume_cm3: totalVolumeCm3,
    payment_method: input.paymentMethod ?? "gateway",
    payment_gateway: input.paymentMethod === "wallet" ? "wallet" : "midtrans",
  };

  const packagePayload =
    input.serviceType === "PAKET" && input.packageDetails
      ? {
          sender_name: input.packageDetails.senderName,
          sender_phone: input.packageDetails.senderPhone,
          recipient_name: input.packageDetails.recipientName,
          recipient_phone: input.packageDetails.recipientPhone,
          package_type: input.packageDetails.packageType,
          weight_kg: input.packageDetails.weightKg,
          length_cm: input.packageDetails.lengthCm,
          width_cm: input.packageDetails.widthCm,
          height_cm: input.packageDetails.heightCm,
        }
      : null;

  const { data: orderId, error: rpcError } = await admin.rpc(
    "insert_transit_order_atomic",
    {
      p_order: orderPayload,
      p_package: packagePayload,
    }
  );

  if (rpcError || !orderId) {
    return {
      ok: false,
      error: rpcError?.message ?? "Gagal menyimpan pesanan transit",
    };
  }

  const productLabel =
    input.serviceType === "NGOJEK"
      ? "NGOJEK Ride"
      : input.serviceType === "NGOMOBIL"
        ? "NGOMOBIL Ride"
        : "PAKET Delivery";

  await admin.from("order_items").insert({
    order_id: orderId,
    product_id: null,
    quantity: 1,
    price: 0,
    product_name: productLabel,
  });

  return {
    ok: true,
    orderId: orderId as string,
    deliveryFee,
    distanceKm,
    totalVolumeCm3,
    serviceType: input.serviceType,
  };
}
