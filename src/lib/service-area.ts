import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateDriverProximityAvailability } from "@/lib/customer-driver-match";
import { haversineKm } from "@/lib/geo-config";
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
 * NGOJEK / NGOMOBIL / PAKET: gate ketersediaan murni radius GPS 3 km.
 * Kuliner (NGEMIL): driver proximity di titik antar, tanpa cocokkan nama kota.
 */
export async function checkRideServiceAvailability(
  admin: SupabaseClient,
  pickupLat: unknown,
  pickupLng: unknown,
  destLat: unknown,
  destLng: unknown,
  serviceType?: "NGOJEK" | "NGOMOBIL" | "PAKET"
): Promise<ServiceAvailability> {
  const useTransitMatching =
    serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType == null;

  if (useTransitMatching) {
    const { resolveClusterIdForCoords } = await import("@/lib/operational-cluster");
    const { resolvePickupProvinceMeta } = await import("@/lib/ride-matching");

    const transitType = serviceType === "NGOMOBIL" ? "NGOMOBIL" : "NGOJEK";
    const result = await evaluateDriverProximityAvailability(
      admin,
      pickupLat,
      pickupLng,
      transitType
    );

    const effectiveLat = result.effective_lat;
    const effectiveLng = result.effective_lng;
    const cities = await loadActiveServiceCities(admin);
    const pickupCity = findCityForCoords(cities, effectiveLat, effectiveLng);
    const clusterId = await resolveClusterIdForCoords(admin, effectiveLat, effectiveLng);
    const { provinceName } = await resolvePickupProvinceMeta(
      admin,
      effectiveLat,
      effectiveLng
    );

    if (!result.available) {
      return {
        available: false,
        message: result.message,
        cityId: pickupCity?.id ?? clusterId,
        cityName: pickupCity?.name ?? provinceName,
        error_code: result.error_code,
        debug_info: result.debug_info,
      };
    }

    return {
      available: true,
      cityId: pickupCity?.id ?? clusterId,
      cityName: pickupCity?.name ?? provinceName,
      error_code: result.error_code,
      debug_info: result.debug_info,
    };
  }

  const result = await evaluateDriverProximityAvailability(
    admin,
    pickupLat,
    pickupLng,
    "PAKET"
  );

  if (!result.available) {
    return {
      available: false,
      message: result.message,
      cityId: null,
      cityName: null,
      error_code: result.error_code,
      debug_info: result.debug_info,
    };
  }

  const cities = await loadActiveServiceCities(admin);
  const pickupCity = findCityForCoords(cities, result.effective_lat, result.effective_lng);

  return {
    available: true,
    cityId: pickupCity?.id ?? null,
    cityName: pickupCity?.name ?? null,
    error_code: result.error_code,
    debug_info: result.debug_info,
  };
}
