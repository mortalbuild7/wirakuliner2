import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceType } from "@/lib/service-types";

/** Radius maksimal pencarian driver dari titik jemput customer (GPS). */
export const MAX_RADIUS_METERS = 3000;
export const CUSTOMER_DRIVER_RADIUS_KM = MAX_RADIUS_METERS / 1000;

export const EMPTY_DRIVER_ZONE_MESSAGE =
  "Maaf, layanan Wira Kuliner belum tersedia atau driver belum siap di wilayah ini. Kami akan segera hadir!";

export type CustomerDriverMatchRow = {
  driver_id: string;
  distance_km: number;
  priority_score: number;
  completion_rate: number;
  acceptance_rate: number;
  average_rating: number;
  service_category?: string;
};

function clampCoord(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function normalizeTransitService(
  service?: ServiceType | null
): "NGOJEK" | "NGOMOBIL" {
  return service === "NGOMOBIL" ? "NGOMOBIL" : "NGOJEK";
}

/**
 * COUNT driver idle (ONLINE di app) dalam radius GPS — PostGIS ST_DWithin / Haversine di DB.
 * Tidak memfilter nama kota/provinsi administratif.
 */
export async function countNearbyIdleDrivers(
  admin: SupabaseClient,
  lat: number,
  lng: number,
  opts?: {
    serviceType?: ServiceType;
    packageVolumeCm3?: number;
    radiusKm?: number;
  }
): Promise<number> {
  const { data, error } = await admin.rpc("count_idle_drivers_within_radius", {
    lat_customer: lat,
    lng_customer: lng,
    radius_km: opts?.radiusKm ?? CUSTOMER_DRIVER_RADIUS_KM,
    requested_service: normalizeTransitService(opts?.serviceType),
    package_volume_cm3: opts?.packageVolumeCm3 ?? 0,
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

function logProximityCheck(
  lat: number,
  lng: number,
  driverCount: number,
  serviceType: ServiceType
): void {
  console.log("Koordinat Customer:", lat, lng);
  console.log("Jumlah Driver Terdekat < 3KM yang Online:", driverCount);
  console.log("Layanan diminta:", serviceType);
}

/** Pre-check ketersediaan driver sebelum order customer dibuat — murni radius GPS. */
export async function checkDriverAvailabilityServer(
  admin: SupabaseClient,
  lat: number,
  lng: number,
  serviceType: ServiceType = "NGOJEK"
): Promise<boolean> {
  const safeLat = clampCoord(lat, -90, 90);
  const safeLng = clampCoord(lng, -180, 180);
  if (safeLat == null || safeLng == null) {
    console.log("Koordinat Customer: invalid", lat, lng);
    console.log("Jumlah Driver Terdekat < 3KM yang Online:", 0);
    return false;
  }

  const count = await countNearbyIdleDrivers(admin, safeLat, safeLng, {
    serviceType,
  });
  logProximityCheck(safeLat, safeLng, count, serviceType);
  return count > 0;
}

/**
 * Pencarian driver terdekat untuk dispatch customer — radius GPS ketat 3 km.
 */
export async function findCustomerNearbyDrivers(
  admin: SupabaseClient,
  opts: {
    lat: number;
    lng: number;
    skipDriverIds?: string[];
    limit?: number;
    requestedService?: ServiceType;
    packageVolumeCm3?: number;
    radiusKm?: number;
    offerTimeoutSeconds?: number;
  }
): Promise<CustomerDriverMatchRow[]> {
  const { data, error } = await admin.rpc("find_nearest_priority_drivers_customer", {
    lat_customer: opts.lat,
    lng_customer: opts.lng,
    max_radius_km: opts.radiusKm ?? CUSTOMER_DRIVER_RADIUS_KM,
    requested_service: normalizeTransitService(opts.requestedService),
    package_volume_cm3: opts.packageVolumeCm3 ?? 0,
    p_skip_driver_ids: opts.skipDriverIds ?? [],
    p_offer_timeout_seconds: opts.offerTimeoutSeconds ?? 15,
    p_limit: opts.limit ?? 20,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerDriverMatchRow[];
}
