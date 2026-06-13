import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  evaluateDriverProximityAvailability,
  findCustomerNearbyDrivers,
  type DriverAvailabilityResult,
} from "@/lib/customer-driver-match";
import { resolveClusterIdForCoords } from "@/lib/operational-cluster";
import { loadActiveServiceCities, findCityForCoords } from "@/lib/service-area";
import type { PriorityDriverMatchRow, RideMatchingMode } from "@/lib/ride-matching-types";

export type { PriorityDriverMatchRow, RideMatchingMode } from "@/lib/ride-matching-types";

export const INTRA_CLUSTER_RADIUS_KM = 5;
export const INTRA_PROVINCE_RADIUS_KM = 15;
export const BORDERLINE_BUFFER_KM_MIN = 30;
export const BORDERLINE_BUFFER_KM_MAX = 50;
export const BORDERLINE_BUFFER_KM_DEFAULT = 40;

export const BORDER_SURCHARGE_LOW = 5_000;
export const BORDER_SURCHARGE_HIGH = 10_000;

export type RideMatchingContext = {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  pickupProvinceId: number | null;
  pickupProvinceName: string | null;
  hasOfficialBranch: boolean;
  serviceCityId: string | null;
  serviceCityName: string | null;
  operationalClusterId: string | null;
  matchingMode: RideMatchingMode | null;
  isBorderlineCrossing: boolean;
  borderSurcharge: number;
  available: boolean;
  message?: string;
  error_code?: DriverAvailabilityResult["error_code"];
  availability_debug?: DriverAvailabilityResult["debug_info"];
};

/** Metadata provinsi/kota dari koordinat — hanya laporan/tarif, bukan gate ketersediaan. */
export async function resolvePickupProvinceMeta(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<{ provinceId: number | null; provinceName: string | null }> {
  const cities = await loadActiveServiceCities(admin);
  const hit = findCityForCoords(cities, lat, lng);
  if (!hit) return { provinceId: null, provinceName: null };

  const { data: sc } = await admin
    .from("service_cities")
    .select("province_id, provinces(name)")
    .eq("id", hit.id)
    .maybeSingle();

  const provJoin = sc?.provinces as { name: string } | { name: string }[] | null;
  const provName = Array.isArray(provJoin) ? provJoin[0]?.name : provJoin?.name;

  return {
    provinceId: (sc?.province_id as number | null) ?? null,
    provinceName: provName ?? null,
  };
}

export function computeBorderSurcharge(
  mode: RideMatchingMode | null,
  nearestDriverDistanceKm?: number | null
): number {
  if (mode !== "borderline") return 0;
  const d = nearestDriverDistanceKm ?? BORDERLINE_BUFFER_KM_DEFAULT;
  if (d <= 35) return BORDER_SURCHARGE_LOW;
  return BORDER_SURCHARGE_HIGH;
}

/**
 * Evaluasi matching NGOJEK/NGOMOBIL — gate HANYA radius GPS 3 km (PostGIS).
 * Tidak ada pengecekan string kota/provinsi.
 */
export async function evaluateRideMatchingContext(
  admin: SupabaseClient,
  pickupLat: unknown,
  pickupLng: unknown,
  destLat: unknown,
  destLng: unknown,
  serviceType: "NGOJEK" | "NGOMOBIL" = "NGOJEK"
): Promise<RideMatchingContext> {
  const availability = await evaluateDriverProximityAvailability(
    admin,
    pickupLat,
    pickupLng,
    serviceType
  );

  const effectiveLat = availability.effective_lat;
  const effectiveLng = availability.effective_lng;

  const cities = await loadActiveServiceCities(admin);
  const pickupCity = findCityForCoords(cities, effectiveLat, effectiveLng);
  const clusterId = await resolveClusterIdForCoords(admin, effectiveLat, effectiveLng);
  const { provinceId, provinceName } = await resolvePickupProvinceMeta(
    admin,
    effectiveLat,
    effectiveLng
  );

  const destLatNum = Number(destLat);
  const destLngNum = Number(destLng);

  const baseContext = {
    pickupLat: effectiveLat,
    pickupLng: effectiveLng,
    destLat: Number.isFinite(destLatNum) ? destLatNum : effectiveLat,
    destLng: Number.isFinite(destLngNum) ? destLngNum : effectiveLng,
    pickupProvinceId: provinceId,
    pickupProvinceName: provinceName,
    hasOfficialBranch: Boolean(pickupCity),
    serviceCityId: pickupCity?.id ?? null,
    serviceCityName: pickupCity?.name ?? null,
    operationalClusterId: clusterId,
    matchingMode: null as RideMatchingMode | null,
    isBorderlineCrossing: false,
    borderSurcharge: 0,
    error_code: availability.error_code,
    availability_debug: availability.debug_info,
  };

  if (!availability.available) {
    return {
      ...baseContext,
      available: false,
      message: availability.message ?? EMPTY_DRIVER_ZONE_MESSAGE,
    };
  }

  const drivers = await findCustomerNearbyDrivers(admin, {
    lat: effectiveLat,
    lng: effectiveLng,
    requestedService: serviceType,
    limit: 1,
    radiusKm: CUSTOMER_DRIVER_RADIUS_KM,
  });

  const nearestKm = drivers[0]?.distance_km ?? null;

  return {
    ...baseContext,
    matchingMode: "customer_proximity",
    borderSurcharge: computeBorderSurcharge(null, nearestKm),
    available: true,
  };
}

export async function findTransitPriorityDrivers(
  admin: SupabaseClient,
  opts: {
    lat: number;
    lng: number;
    pickupProvinceId?: number | null;
    hasOfficialBranch?: boolean;
    operationalClusterId?: string | null;
    skipDriverIds?: string[];
    limit?: number;
    requestedService?: "NGOJEK" | "NGOMOBIL";
    packageVolumeCm3?: number;
    borderlineBufferKm?: number;
  }
): Promise<PriorityDriverMatchRow[]> {
  const rows = await findCustomerNearbyDrivers(admin, {
    lat: opts.lat,
    lng: opts.lng,
    skipDriverIds: opts.skipDriverIds,
    limit: opts.limit,
    requestedService: opts.requestedService,
    packageVolumeCm3: opts.packageVolumeCm3,
  });

  return rows.map((row) => ({
    ...row,
    match_mode: "customer_proximity" as RideMatchingMode,
    driver_province_id: null,
    is_borderline: false,
  }));
}

export type ServiceAreaFromMatching = {
  available: boolean;
  message?: string;
  cityId: string | null;
  cityName: string | null;
  error_code?: DriverAvailabilityResult["error_code"];
  debug_info?: DriverAvailabilityResult["debug_info"];
};

export function matchingContextToServiceArea(
  ctx: RideMatchingContext
): ServiceAreaFromMatching {
  return {
    available: ctx.available,
    message: ctx.message,
    cityId: ctx.serviceCityId ?? ctx.operationalClusterId,
    cityName: ctx.serviceCityName ?? ctx.pickupProvinceName,
    error_code: ctx.error_code,
    debug_info: ctx.availability_debug,
  };
}

/** @deprecated — gunakan resolvePickupProvinceMeta */
export const resolvePickupProvinceId = resolvePickupProvinceMeta;
