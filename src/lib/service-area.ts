import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateDriverProximityAvailability } from "@/lib/customer-driver-match";
import { haversineKm } from "@/lib/geo-config";
import { resolvePickupRadiusKm } from "@/lib/jabodetabek-policy";
import { assertPickupInJabodetabekCluster } from "@/lib/jabodetabek-policy-server";
import type { DriverAvailabilityDebugInfo, DriverAvailabilityErrorCode } from "@/lib/driver-availability-types";

export const SERVICE_UNAVAILABLE_MSG =
  "Layanan ini masih belum tersedia diwilayah anda";

export type ServiceCity = {
  id: string;
  name: string;
  slug: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
};

export type ServiceAvailability = {
  available: boolean;
  message?: string;
  cityId: string | null;
  cityName: string | null;
  error_code?: DriverAvailabilityErrorCode;
  debug_info?: DriverAvailabilityDebugInfo;
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadActiveServiceCities(
  admin: SupabaseClient
): Promise<ServiceCity[]> {
  const { data } = await admin
    .from("service_cities")
    .select("id, name, slug, center_lat, center_lng, radius_km, is_active")
    .eq("is_active", true)
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    center_lat: toNum(row.center_lat),
    center_lng: toNum(row.center_lng),
    radius_km: toNum(row.radius_km),
    is_active: Boolean(row.is_active),
  }));
}

/** Kota terdekat yang mencakup koordinat (dalam radius). */
export function findCityForCoords(
  cities: ServiceCity[],
  lat: number,
  lng: number
): ServiceCity | null {
  let best: ServiceCity | null = null;
  let bestDist = Infinity;

  for (const city of cities) {
    const dist = haversineKm(lat, lng, city.center_lat, city.center_lng);
    if (dist <= city.radius_km && dist < bestDist) {
      best = city;
      bestDist = dist;
    }
  }

  return best;
}

/** Cek wilayah aktif dan ada driver terdaftar di kota tersebut. */
export async function checkServiceAvailability(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<ServiceAvailability> {
  const cities = await loadActiveServiceCities(admin);
  const city = findCityForCoords(cities, lat, lng);

  if (!city) {
    return {
      available: false,
      message: SERVICE_UNAVAILABLE_MSG,
      cityId: null,
      cityName: null,
    };
  }

  const { count } = await admin
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .eq("service_city_id", city.id);

  if (!count || count === 0) {
    return {
      available: false,
      message: SERVICE_UNAVAILABLE_MSG,
      cityId: city.id,
      cityName: city.name,
    };
  }

  return {
    available: true,
    cityId: city.id,
    cityName: city.name,
  };
}

/** Validasi pesanan kuliner (NGEMIL) — driver proximity GPS di titik antar, tanpa gate nama kota. */
export async function checkFoodServiceAvailability(
  admin: SupabaseClient,
  merchant: {
    service_city_id?: string | null;
    latitude: number;
    longitude: number;
  },
  deliveryLat: number,
  deliveryLng: number,
  dineIn: boolean
): Promise<ServiceAvailability> {
  const anchorLat = dineIn ? merchant.latitude : deliveryLat;
  const anchorLng = dineIn ? merchant.longitude : deliveryLng;

  const result = await evaluateDriverProximityAvailability(
    admin,
    anchorLat,
    anchorLng,
    "NGOJEK"
  );

  const cities = await loadActiveServiceCities(admin);
  const city = findCityForCoords(cities, result.effective_lat, result.effective_lng);

  if (!result.available) {
    return {
      available: false,
      message: result.message ?? SERVICE_UNAVAILABLE_MSG,
      cityId: city?.id ?? null,
      cityName: city?.name ?? null,
      error_code: result.error_code,
      debug_info: result.debug_info,
    };
  }

  return {
    available: true,
    cityId: city?.id ?? null,
    cityName: city?.name ?? null,
    error_code: result.error_code,
    debug_info: result.debug_info,
  };
}

/**
 * NGOJEK / NGOMOBIL / PAKET: cluster JABODETABEK (pick-up) + radius jemput dinamis.
 * Tujuan tidak dibandingkan — mendukung AKAP lintas kota/provinsi.
 */
export async function checkRideServiceAvailability(
  admin: SupabaseClient,
  pickupLat: unknown,
  pickupLng: unknown,
  _destLat: unknown,
  _destLng: unknown,
  serviceType: "NGOJEK" | "NGOMOBIL" | "PAKET" = "NGOJEK",
  packageVolumeCm3 = 0
): Promise<ServiceAvailability> {
  const parsedLat = Number(pickupLat);
  const parsedLng = Number(pickupLng);
  const pickupRadiusKm = resolvePickupRadiusKm(serviceType, packageVolumeCm3);

  const clusterCheck =
    Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
      ? await assertPickupInJabodetabekCluster(admin, parsedLat, parsedLng)
      : { ok: false as const, message: "Titik jemput di luar cluster JABODETABEK" };

  const result = await evaluateDriverProximityAvailability(
    admin,
    pickupLat,
    pickupLng,
    serviceType,
    { radiusKm: pickupRadiusKm, packageVolumeCm3 }
  );

  const effectiveLat = result.effective_lat;
  const effectiveLng = result.effective_lng;
  const cities = await loadActiveServiceCities(admin);
  const pickupCity = findCityForCoords(cities, effectiveLat, effectiveLng);
  const { resolvePickupProvinceMeta } = await import("@/lib/ride-matching");
  const { provinceName } = await resolvePickupProvinceMeta(
    admin,
    effectiveLat,
    effectiveLng
  );

  const clusterId = clusterCheck.ok ? clusterCheck.clusterId : null;
  const clusterName = clusterCheck.ok ? clusterCheck.clusterName : null;

  if (!clusterCheck.ok) {
    return {
      available: false,
      message: clusterCheck.message,
      cityId: pickupCity?.id ?? null,
      cityName: pickupCity?.name ?? null,
      error_code: result.error_code,
      debug_info: result.debug_info,
    };
  }

  if (!result.available) {
    return {
      available: false,
      message: result.message,
      cityId: pickupCity?.id ?? clusterId,
      cityName: pickupCity?.name ?? clusterName ?? provinceName,
      error_code: result.error_code,
      debug_info: result.debug_info,
    };
  }

  return {
    available: true,
    cityId: pickupCity?.id ?? clusterId,
    cityName: pickupCity?.name ?? clusterName ?? provinceName,
    error_code: result.error_code,
    debug_info: result.debug_info,
  };
}
