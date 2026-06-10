import { haversineKm } from "@/lib/geo-config";
import {
  computeTransitFareFromTariff,
  fetchRegionalTransitTariff,
  resolveRegionalIdsFromServiceCity,
} from "@/lib/regional-transit-pricing";
import { NGOJEK_MAX_DISTANCE_KM, NGOJEK_MIN_DISTANCE_KM } from "@/lib/ngojek-ride-logic";
import { checkRideServiceAvailability } from "@/lib/service-area";
import { isServiceType, type ServiceType } from "@/lib/service-types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

/** Preview tarif transit server-side — anti manipulasi harga di client. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-quote-transit", RATE_LIMITS.api);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    pickupLat?: number;
    pickupLng?: number;
    destinationLat?: number;
    destinationLng?: number;
    serviceType?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;
  const pickupLat = parseBoundedNumber(body.pickupLat, -90, 90);
  const pickupLng = parseBoundedNumber(body.pickupLng, -180, 180);
  const destinationLat = parseBoundedNumber(body.destinationLat, -90, 90);
  const destinationLng = parseBoundedNumber(body.destinationLng, -180, 180);

  if (
    pickupLat == null ||
    pickupLng == null ||
    destinationLat == null ||
    destinationLng == null
  ) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const serviceType: ServiceType = isServiceType(body.serviceType)
    ? body.serviceType
    : "NGOJEK";

  const distanceKm = haversineKm(
    pickupLat,
    pickupLng,
    destinationLat,
    destinationLng
  );

  if (distanceKm < NGOJEK_MIN_DISTANCE_KM) {
    return secureJsonResponse({
      distanceKm,
      rideFee: 0,
      tooClose: true,
      feeDescription: "Jemput dan tujuan terlalu dekat",
    });
  }

  if (distanceKm > NGOJEK_MAX_DISTANCE_KM) {
    return secureJsonResponse({
      distanceKm,
      rideFee: 0,
      tooFar: true,
      feeDescription: `Maksimal ${NGOJEK_MAX_DISTANCE_KM} km`,
    });
  }

  const admin = createAdminClient();
  const serviceArea = await checkRideServiceAvailability(
    admin,
    pickupLat,
    pickupLng,
    destinationLat,
    destinationLng
  );

  if (!serviceArea.available) {
    return secureJsonResponse({
      distanceKm,
      rideFee: 0,
      areaAvailable: false,
      areaMessage: serviceArea.message ?? "Layanan tidak tersedia di wilayah ini",
    });
  }

  const { provinceId, cityId } = await resolveRegionalIdsFromServiceCity(
    admin,
    serviceArea.cityId
  );

  const tariff =
    provinceId != null
      ? await fetchRegionalTransitTariff(admin, provinceId, cityId, serviceType)
      : null;

  const rideFee = computeTransitFareFromTariff(tariff, distanceKm);
  const base = tariff ? Number(tariff.base_fare) : 10_000;
  const perKm = tariff ? Number(tariff.price_per_km) : 2_000;

  return secureJsonResponse({
    distanceKm,
    rideFee,
    serviceType,
    areaAvailable: true,
    feeDescription: `Rp ${base.toLocaleString("id-ID")} + Rp ${perKm.toLocaleString("id-ID")}/km × ${distanceKm.toFixed(2)} km`,
  });
}
