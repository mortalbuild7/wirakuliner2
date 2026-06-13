import { haversineKm } from "@/lib/geo-config";
import { formatTransitAddressByService } from "@/lib/order-channel";
import {
  computeTransitFareFromTariff,
  fetchRegionalTransitTariff,
  resolveRegionalIdsFromServiceCity,
} from "@/lib/regional-transit-pricing";
import { createTransitOrderSchema } from "@/lib/admin/order-transit-schemas";
import { computePackageVolumeCm3, isServiceType, type ServiceType } from "@/lib/service-types";
import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import { evaluateRideMatchingContext } from "@/lib/ride-matching";
import { checkRideServiceAvailability, checkServiceAvailability } from "@/lib/service-area";
import { NGOJEK_MIN_DISTANCE_KM } from "@/lib/ngojek-ride-logic";
import { validateTransitRideDistance } from "@/lib/jabodetabek-policy";
import { debitCustomerForOrder } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceDistributedRateLimit,
  enforceMethod,
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
  const rl = await enforceDistributedRateLimit(
    req,
    "orders-place-ride",
    RATE_LIMITS.orderPlace
  );
  if (rl) return rl;

  const parsed = await readJsonBody<{
    pickupAddress?: string;
    destinationAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
    destinationLat?: number;
    destinationLng?: number;
    skipPayment?: boolean;
    forceCreateOrder?: boolean;
    quotedRideFee?: number;
    paymentMethod?: string;
    serviceType?: string;
    packageDetails?: {
      senderName?: string;
      senderPhone?: string;
      recipientName?: string;
      recipientPhone?: string;
      packageType?: string;
      weightKg?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
    };
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
  if (distanceKm < NGOJEK_MIN_DISTANCE_KM) {
    return secureJsonResponse(
      { error: "Titik jemput dan tujuan terlalu dekat" },
      { status: 400 }
    );
  }

  const serviceType: ServiceType = isServiceType(body.serviceType)
    ? body.serviceType
    : "NGOJEK";

  let totalVolumeCm3 = 0;
  if (serviceType === "PAKET" && body.packageDetails) {
    totalVolumeCm3 = computePackageVolumeCm3(
      body.packageDetails.lengthCm ?? 0,
      body.packageDetails.widthCm ?? 0,
      body.packageDetails.heightCm ?? 0
    );
  }

  const distanceCheck = validateTransitRideDistance(
    serviceType,
    distanceKm,
    totalVolumeCm3
  );
  if (!distanceCheck.ok) {
    return secureJsonResponse({ error: distanceCheck.error }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return secureJsonResponse({ error: "Silakan login sebagai customer" }, { status: 401 });
  }

  const admin = createAdminClient();

  const forceCreateOrder =
    body.forceCreateOrder === true || body.skipPayment === true;

  const isTransit =
    serviceType === "NGOJEK" ||
    serviceType === "NGOMOBIL" ||
    serviceType === "PAKET";
  const matchingCtx = isTransit
    ? await evaluateRideMatchingContext(
        admin,
        pickupLat,
        pickupLng,
        destinationLat,
        destinationLng,
        serviceType,
        { packageVolumeCm3: totalVolumeCm3 }
      )
    : null;

  if (isTransit && matchingCtx && !matchingCtx.available && !forceCreateOrder) {
    return secureJsonResponse(
      { error: matchingCtx.message ?? "Layanan tidak tersedia di wilayah ini" },
      { status: 403 }
    );
  }

  const serviceArea =
    isTransit && matchingCtx
      ? {
          available: forceCreateOrder ? true : matchingCtx.available,
          message: matchingCtx.message,
          cityId: matchingCtx.serviceCityId ?? matchingCtx.operationalClusterId,
          cityName: matchingCtx.serviceCityName ?? matchingCtx.pickupProvinceName,
        }
      : await checkRideServiceAvailability(
          admin,
          pickupLat,
          pickupLng,
          destinationLat,
          destinationLng,
          serviceType
        );

  if (!serviceArea.available && !forceCreateOrder) {
    return secureJsonResponse(
      { error: serviceArea.message ?? "Layanan tidak tersedia di wilayah ini" },
      { status: 403 }
    );
  }

  const operationalClusterId = matchingCtx?.operationalClusterId ?? null;

  const nearestServiceCity = isTransit
    ? await checkServiceAvailability(admin, pickupLat, pickupLng)
    : serviceArea;

  const serviceCityIdForOrder =
    nearestServiceCity.cityId ?? matchingCtx?.serviceCityId ?? serviceArea.cityId;

  const pickupProvinceId =
    matchingCtx?.pickupProvinceId ??
    (await resolveRegionalIdsFromServiceCity(admin, serviceCityIdForOrder)).provinceId;

  const borderSurcharge = matchingCtx?.borderSurcharge ?? 0;
  const isBorderlineCrossing = matchingCtx?.isBorderlineCrossing ?? false;
  const matchingMode =
    matchingCtx?.matchingMode ??
    (forceCreateOrder ? ("customer_proximity" as const) : null);

  const hubMerchantId = await resolveHubMerchantId(admin);
  if (!hubMerchantId) {
    return secureJsonResponse(
      { error: "Layanan transit belum tersedia. Hubungi admin." },
      { status: 503 }
    );
  }

  const { provinceId, cityId } = await resolveRegionalIdsFromServiceCity(
    admin,
    serviceCityIdForOrder
  );
  const tariff =
    provinceId != null
      ? await fetchRegionalTransitTariff(admin, provinceId, cityId, serviceType)
      : null;
  let rideFee =
    computeTransitFareFromTariff(tariff, distanceKm) + borderSurcharge;

  const quotedClient = parseBoundedNumber(body.quotedRideFee, 0, 50_000_000);
  if (forceCreateOrder && quotedClient != null && quotedClient > 0 && rideFee <= 0) {
    rideFee = quotedClient + borderSurcharge;
  }

  const deliveryAddress = formatTransitAddressByService(
    serviceType,
    pickupAddress,
    destinationAddress
  );
  const useWallet = body.paymentMethod === "wallet";
  const skipPayment =
    !useWallet &&
    (body.skipPayment === true || process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true");

  let packagePayload: Record<string, unknown> | null = null;

  if (serviceType === "PAKET") {
    const pkgParsed = createTransitOrderSchema.safeParse({
      serviceType: "PAKET",
      pickupAddress,
      destinationAddress,
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      packageDetails: body.packageDetails
        ? {
            senderName: body.packageDetails.senderName,
            senderPhone: body.packageDetails.senderPhone,
            recipientName: body.packageDetails.recipientName,
            recipientPhone: body.packageDetails.recipientPhone,
            packageType: body.packageDetails.packageType,
            weightKg: body.packageDetails.weightKg,
            lengthCm: body.packageDetails.lengthCm,
            widthCm: body.packageDetails.widthCm,
            heightCm: body.packageDetails.heightCm,
          }
        : undefined,
    });

    if (!pkgParsed.success) {
      const msg = pkgParsed.error.issues.map((i) => i.message).join("; ");
      return secureJsonResponse({ error: msg || "Data paket tidak valid" }, { status: 400 });
    }

    const pkg = pkgParsed.data.packageDetails!;
    totalVolumeCm3 = computePackageVolumeCm3(pkg.lengthCm, pkg.widthCm, pkg.heightCm);
    packagePayload = {
      sender_name: pkg.senderName,
      sender_phone: pkg.senderPhone,
      recipient_name: pkg.recipientName,
      recipient_phone: pkg.recipientPhone,
      package_type: pkg.packageType,
      weight_kg: pkg.weightKg,
      length_cm: pkg.lengthCm,
      width_cm: pkg.widthCm,
      height_cm: pkg.heightCm,
    };
  }

  let orderId: string;

  if (serviceType === "PAKET" && packagePayload) {
    const { data: rpcOrderId, error: rpcError } = await admin.rpc(
      "insert_transit_order_atomic",
      {
        p_order: {
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
          service_city_id: serviceCityIdForOrder,
          operational_cluster_id: operationalClusterId,
          pickup_province_id: pickupProvinceId,
          is_borderline_crossing: isBorderlineCrossing,
          border_surcharge: borderSurcharge,
          matching_mode: matchingMode,
          province_id: provinceId,
          city_id: cityId,
          service_type: serviceType,
          total_volume_cm3: totalVolumeCm3,
          payment_method: useWallet ? "wallet" : "gateway",
          payment_gateway: useWallet ? "wallet" : skipPayment ? "test_bypass" : "midtrans",
        },
        p_package: packagePayload,
      }
    );

    if (rpcError || !rpcOrderId) {
      return secureJsonResponse(
        { error: rpcError?.message ?? "Gagal membuat pesanan PAKET" },
        { status: 500 }
      );
    }
    orderId = rpcOrderId as string;
  } else {
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
        service_city_id: serviceCityIdForOrder,
        operational_cluster_id: operationalClusterId,
        pickup_province_id: pickupProvinceId,
        is_borderline_crossing: isBorderlineCrossing,
        border_surcharge: borderSurcharge,
        matching_mode: matchingMode,
        province_id: provinceId,
        city_id: cityId,
        service_type: serviceType,
        total_volume_cm3: totalVolumeCm3,
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
    orderId = order.id;
  }

  const order = { id: orderId };

  const { error: itemsError } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: null,
    quantity: 1,
    price: 0,
    product_name:
      serviceType === "NGOMOBIL"
        ? "NGOMOBIL Ride"
        : serviceType === "PAKET"
          ? "PAKET Delivery"
          : "NGOJEK Ride",
  });

  if (itemsError) {
    await admin.from("orders").delete().eq("id", order.id);
    return secureJsonResponse(
      { error: itemsError.message ?? "Gagal menyimpan detail ride" },
      { status: 500 }
    );
  }

  if (useWallet) {
    try {
      await debitCustomerForOrder(admin, user.id, rideFee, order.id);
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
      rideFee,
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
