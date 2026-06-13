import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INVALID_CUSTOMER_GPS_COORDS_MSG,
  parseCustomerCoords,
} from "@/lib/coord-parse";
import type {
  DriverAvailabilityErrorCode,
  DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
import { haversineKm } from "@/lib/geo-config";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import {
  resolveDriverCategoryForService,
  type ServiceType,
} from "@/lib/service-types";

import {
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  MAX_RADIUS_METERS,
} from "@/lib/driver-match-constants";

export {
  MAX_RADIUS_METERS,
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
} from "@/lib/driver-match-constants";
export { isTransitProximityService } from "@/lib/driver-availability-types";
export type {
  DriverAvailabilityDebugInfo,
  DriverAvailabilityErrorCode,
  DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
export { parseCustomerCoords, DEFAULT_OPS_CENTER } from "@/lib/coord-parse";

export type CustomerDriverMatchRow = {
  driver_id: string;
  distance_km: number;
  priority_score: number;
  completion_rate: number;
  acceptance_rate: number;
  average_rating: number;
  service_category?: string;
};

type NearestIdleDriver = {
  driver_id: string;
  lat: number;
  lng: number;
  distance_km: number;
};

type CountDriversResult = {
  count: number;
  matchEngine: "postgis" | "haversine";
  rpcFallbackReason?: string | null;
};

function normalizeTransitService(
  service?: ServiceType | null
): "NGOJEK" | "NGOMOBIL" {
  return service === "NGOMOBIL" ? "NGOMOBIL" : "NGOJEK";
}

function parseDriverCoord(value: unknown): number | null {
  const n = parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(n) || isNaN(n) || Math.abs(n) < 1e-9) return null;
  return n;
}

function buildAvailabilityResult(
  partial: Omit<DriverAvailabilityResult, "debug_info"> & {
    debug_info: Omit<
      DriverAvailabilityResult["debug_info"],
      "customer_coords" | "effective_coords"
    >;
  },
  customerCoords: [number, number],
  effectiveCoords: [number, number]
): DriverAvailabilityResult {
  return {
    ...partial,
    effective_lat: effectiveCoords[0],
    effective_lng: effectiveCoords[1],
    debug_info: {
      ...partial.debug_info,
      customer_coords: customerCoords,
      effective_coords: effectiveCoords,
    },
  };
}

/**
 * COUNT via PostGIS RPC — dibungkus try/catch terisolasi.
 */
async function countIdleDriversViaPostgisRpc(
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

  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Fallback Haversine — query tabel `drivers` tanpa RPC PostGIS.
 * `broad=true` mengabaikan filter kategori (cadangan jika RPC/SQL enum bermasalah).
 */
async function countIdleDriversViaHaversineFallback(
  admin: SupabaseClient,
  lat: number,
  lng: number,
  opts?: {
    serviceType?: ServiceType;
    packageVolumeCm3?: number;
    radiusKm?: number;
    broad?: boolean;
  }
): Promise<number> {
  const radiusKm = opts?.radiusKm ?? CUSTOMER_DRIVER_RADIUS_KM;

  let query = admin
    .from("drivers")
    .select("id, current_lat, current_lng, gps_trust, service_category")
    .eq("status", "idle")
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);

  if (!opts?.broad) {
    const category = resolveDriverCategoryForService(
      opts?.serviceType ?? "NGOJEK",
      opts?.packageVolumeCm3 ?? 0
    );
    query = query.eq("service_category", category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `[Haversine fallback${opts?.broad ? " broad" : ""}] ${extractServerErrorMessage(error)}`
    );
  }

  let count = 0;
  for (const row of data ?? []) {
    const dLat = parseDriverCoord(row.current_lat);
    const dLng = parseDriverCoord(row.current_lng);
    if (dLat == null || dLng == null) continue;
    if (row.gps_trust === "SUSPICIOUS") continue;

    const distKm = haversineKm(lat, lng, dLat, dLng);
    if (distKm <= radiusKm) count += 1;
  }

  return count;
}

/**
 * COUNT driver idle (ONLINE) dalam radius — PostGIS RPC + fallback Haversine.
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
): Promise<CountDriversResult> {
  let rpcFallbackReason: string | null = null;

  try {
    const count = await countIdleDriversViaPostgisRpc(admin, lat, lng, opts);
    return { count, matchEngine: "postgis", rpcFallbackReason: null };
  } catch (rpcError) {
    rpcFallbackReason = extractServerErrorMessage(rpcError);
    console.error("LOG ERROR GEOLOKASI LENGKAP:", rpcError);
    console.warn(
      "[driver-match] PostGIS RPC gagal — mengaktifkan fallback Haversine:",
      rpcFallbackReason
    );
  }

  try {
    const count = await countIdleDriversViaHaversineFallback(admin, lat, lng, opts);
    return {
      count,
      matchEngine: "haversine",
      rpcFallbackReason,
    };
  } catch (categoryFallbackError) {
    const categoryMsg = extractServerErrorMessage(categoryFallbackError);
    console.warn(
      "[driver-match] Haversine kategori gagal — mencoba broad table fallback:",
      categoryMsg
    );

    try {
      const count = await countIdleDriversViaHaversineFallback(admin, lat, lng, {
        ...opts,
        broad: true,
      });
      const combinedReason = rpcFallbackReason
        ? `RPC: ${rpcFallbackReason} | Kategori: ${categoryMsg}`
        : categoryMsg;
      return {
        count,
        matchEngine: "haversine",
        rpcFallbackReason: combinedReason,
      };
    } catch (broadFallbackError) {
      const broadMsg = extractServerErrorMessage(broadFallbackError);
      const combined = [
        rpcFallbackReason ? `RPC gagal: ${rpcFallbackReason}` : null,
        `Kategori gagal: ${categoryMsg}`,
        `Broad gagal: ${broadMsg}`,
      ]
        .filter(Boolean)
        .join(" | ");
      throw new Error(combined);
    }
  }
}

/** Cari driver idle terdekat — null-safe, hanya driver dengan GPS valid. */
export async function findNearestIdleDriverGlobal(
  admin: SupabaseClient,
  anchorLat: number,
  anchorLng: number,
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): Promise<NearestIdleDriver | null> {
  try {
    const category = resolveDriverCategoryForService(serviceType, packageVolumeCm3);

    const { data, error } = await admin
      .from("drivers")
      .select("id, current_lat, current_lng, service_category")
      .eq("status", "idle")
      .eq("service_category", category)
      .not("current_lat", "is", null)
      .not("current_lng", "is", null)
      .limit(80);

    if (error) {
      console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
      return null;
    }
    if (!data?.length) return null;

    let best: NearestIdleDriver | null = null;
    for (const row of data) {
      const dLat = parseDriverCoord(row.current_lat);
      const dLng = parseDriverCoord(row.current_lng);
      if (dLat == null || dLng == null) continue;

      const dist = haversineKm(anchorLat, anchorLng, dLat, dLng);
      if (!best || dist < best.distance_km) {
        best = {
          driver_id: row.id as string,
          lat: dLat,
          lng: dLng,
          distance_km: dist,
        };
      }
    }

    return best;
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return null;
  }
}

export type EvaluateDriverProximityOpts = {
  radiusKm?: number;
  packageVolumeCm3?: number;
};

/**
 * Ketersediaan driver radius GPS — tidak pernah throw ke caller.
 */
export async function evaluateDriverProximityAvailability(
  admin: SupabaseClient,
  rawLat: unknown,
  rawLng: unknown,
  serviceType: ServiceType = "NGOJEK",
  opts: EvaluateDriverProximityOpts = {}
): Promise<DriverAvailabilityResult> {
  const radiusKm = opts.radiusKm ?? CUSTOMER_DRIVER_RADIUS_KM;

  try {
    const parsed = parseCustomerCoords(rawLat, rawLng);
    const customerCoords: [number, number] = [parsed.lat, parsed.lng];

    const logCheck = (
      count: number,
      coords: [number, number],
      code: DriverAvailabilityErrorCode,
      engine?: "postgis" | "haversine"
    ) => {
      console.log("Koordinat Customer:", coords[0], coords[1]);
      console.log("Jumlah Driver Terdekat < 3KM yang Online:", count);
      console.log("Layanan diminta:", serviceType);
      console.log("Availability:", code, engine ? { match_engine: engine } : "");
    };

    if (!parsed.isValid) {
      logCheck(0, customerCoords, "INVALID_COORDINATES");
      return buildAvailabilityResult(
        {
          available: false,
          error_code: "INVALID_COORDINATES",
          message: INVALID_CUSTOMER_GPS_COORDS_MSG,
          effective_lat: parsed.lat,
          effective_lng: parsed.lng,
          debug_info: {
            checked_drivers_count: 0,
            nearest_driver_km: null,
            nearest_driver_id: null,
            service_type: serviceType,
            radius_km: radiusKm,
          },
        },
        customerCoords,
        customerCoords
      );
    }

    const { count, matchEngine, rpcFallbackReason } = await countNearbyIdleDrivers(
      admin,
      parsed.lat,
      parsed.lng,
      {
        serviceType,
        packageVolumeCm3: opts.packageVolumeCm3,
        radiusKm,
      }
    );

    const nearestDriver = await findNearestIdleDriverGlobal(
      admin,
      parsed.lat,
      parsed.lng,
      serviceType,
      opts.packageVolumeCm3
    );

    const effectiveCoords: [number, number] = [parsed.lat, parsed.lng];
    const debugBase = {
      checked_drivers_count: count,
      nearest_driver_km: nearestDriver?.distance_km ?? null,
      nearest_driver_id: nearestDriver?.driver_id ?? null,
      service_type: serviceType,
      radius_km: radiusKm,
      match_engine: matchEngine,
      server_error_detail: null,
      rpc_fallback_reason: rpcFallbackReason ?? null,
    };

    if (count > 0) {
      logCheck(count, effectiveCoords, "AVAILABLE", matchEngine);
      return buildAvailabilityResult(
        {
          available: true,
          error_code: "AVAILABLE",
          effective_lat: parsed.lat,
          effective_lng: parsed.lng,
          debug_info: debugBase,
        },
        customerCoords,
        effectiveCoords
      );
    }

    logCheck(count, effectiveCoords, "NO_ONLINE_DRIVER_IN_RADIUS", matchEngine);

    return buildAvailabilityResult(
      {
        available: false,
        error_code: "NO_ONLINE_DRIVER_IN_RADIUS",
        message: EMPTY_DRIVER_ZONE_MESSAGE,
        effective_lat: parsed.lat,
        effective_lng: parsed.lng,
        debug_info: debugBase,
      },
      customerCoords,
      effectiveCoords
    );
  } catch (error) {
    const detail = extractServerErrorMessage(error);
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    const fallbackLat = parseFloat(String(rawLat ?? "").trim());
    const fallbackLng = parseFloat(String(rawLng ?? "").trim());
    const coords: [number, number] = [
      Number.isFinite(fallbackLat) ? fallbackLat : 0,
      Number.isFinite(fallbackLng) ? fallbackLng : 0,
    ];

    return buildAvailabilityResult(
      {
        available: false,
        error_code: "RPC_ERROR",
        message: detail,
        effective_lat: coords[0],
        effective_lng: coords[1],
        debug_info: {
          checked_drivers_count: 0,
          nearest_driver_km: null,
          nearest_driver_id: null,
          service_type: serviceType,
          radius_km: radiusKm,
          server_error_detail: detail,
          rpc_fallback_reason: null,
        },
      },
      coords,
      coords
    );
  }
}

/** @deprecated Gunakan `evaluateDriverProximityAvailability` — kompatibilitas boolean. */
export async function checkDriverAvailabilityServer(
  admin: SupabaseClient,
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK",
  opts?: EvaluateDriverProximityOpts
): Promise<DriverAvailabilityResult> {
  return evaluateDriverProximityAvailability(admin, lat, lng, serviceType, opts);
}

/**
 * Pencarian driver terdekat untuk dispatch — radius GPS ketat (PostGIS).
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
  try {
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

    if (error) throw error;
    return (data ?? []) as CustomerDriverMatchRow[];
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return [];
  }
}
