import { haversineKm } from "@/lib/geo-config";
import {
  computeTransitFareFromTariff,
  fetchRegionalTransitTariff,
  resolveRegionalIdsFromServiceCity,
} from "@/lib/regional-transit-pricing";
import { NGOJEK_MIN_DISTANCE_KM } from "@/lib/ngojek-ride-logic";
import { validateTransitRideDistance } from "@/lib/jabodetabek-policy";
import { resolvePickupProvinceMeta } from "@/lib/ride-matching";
import { findCityForCoords, loadActiveServiceCities } from "@/lib/service-area";
import { isServiceType, type ServiceType } from "@/lib/service-types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceDistributedRateLimit,
  enforceMethod,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

/** Preview tarif transit — hanya jarak + tarif regional, tanpa gate driver/wilayah. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = await enforceDistributedRateLimit(
    req,
    "orders-quote-transit",
    RATE_LIMITS.orderQuote
  );
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

  const distanceCheck = validateTransitRideDistance(serviceType, distanceKm);
  if (!distanceCheck.ok && distanceCheck.tooFar) {
    return secureJsonResponse({
      distanceKm,
      rideFee: 0,
      tooFar: true,
      feeDescription: distanceCheck.error,
    });
  }

  try {
    const admin = createAdminClient();
    const cities = await loadActiveServiceCities(admin);
    const pickupCity = findCityForCoords(cities, pickupLat, pickupLng);
    const { provinceId } = await resolvePickupProvinceMeta(admin, pickupLat, pickupLng);

    const serviceCityId = pickupCity?.id ?? null;
    const { provinceId: tariffProvinceId, cityId } = await resolveRegionalIdsFromServiceCity(
      admin,
      serviceCityId
    );

    const effectiveProvinceId = tariffProvinceId ?? provinceId ?? null;

    const tariff =
      effectiveProvinceId != null
        ? await fetchRegionalTransitTariff(
            admin,
            effectiveProvinceId,
            cityId,
            serviceType
          )
        : null;

    const fallbackBase =
      serviceType === "NGOMOBIL" ? 15_000 : serviceType === "PAKET" ? 12_000 : 10_000;
    const fallbackPerKm =
      serviceType === "NGOMOBIL" ? 2_700 : serviceType === "PAKET" ? 2_300 : 2_000;

    const rideFee = computeTransitFareFromTariff(
      tariff,
      distanceKm,
      fallbackBase,
      fallbackPerKm
    );
    const base = tariff ? Number(tariff.base_fare) : fallbackBase;
    const perKm = tariff ? Number(tariff.price_per_km) : fallbackPerKm;

    return secureJsonResponse({
      distanceKm,
      rideFee,
      serviceType,
      feeDescription: `Rp ${base.toLocaleString("id-ID")} + Rp ${perKm.toLocaleString("id-ID")}/km × ${distanceKm.toFixed(2)} km`,
    });
  } catch (err) {
    const fallbackBase =
      serviceType === "NGOMOBIL" ? 15_000 : serviceType === "PAKET" ? 12_000 : 10_000;
    const fallbackPerKm =
      serviceType === "NGOMOBIL" ? 2_700 : serviceType === "PAKET" ? 2_300 : 2_000;
    const rideFee = computeTransitFareFromTariff(null, distanceKm, fallbackBase, fallbackPerKm);

    return secureJsonResponse({
      distanceKm,
      rideFee,
      serviceType,
      feeDescription: `Rp ${fallbackBase.toLocaleString("id-ID")} + Rp ${fallbackPerKm.toLocaleString("id-ID")}/km × ${distanceKm.toFixed(2)} km`,
      warning:
        err instanceof Error ? err.message : "Tarif estimasi — konfigurasi wilayah belum lengkap",
    });
  }
}
