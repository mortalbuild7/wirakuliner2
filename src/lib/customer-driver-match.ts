import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCustomerCoords } from "@/lib/coord-parse";
import type {
  DriverAvailabilityErrorCode,
  DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
import { haversineKm } from "@/lib/geo-config";
import { CUSTOMER_GPS_REQUIRED_MSG } from "@/lib/pickup-coords";
import {
  resolveDriverCategoryForService,
  type ServiceType,
} from "@/lib/service-types";

/** Radius maksimal pencarian driver dari titik jemput customer (GPS). */
export const MAX_RADIUS_METERS = 3000;
export const CUSTOMER_DRIVER_RADIUS_KM = MAX_RADIUS_METERS / 1000;

export const EMPTY_DRIVER_ZONE_MESSAGE =
  "Maaf, layanan Wira Kuliner belum tersedia atau driver belum siap di wilayah ini. Kami akan segera hadir!";

export type {
  DriverAvailabilityDebugInfo,
  DriverAvailabilityErrorCode,
  DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
export { isTransitProximityService } from "@/lib/driver-availability-types";
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

function normalizeTransitService(
  service?: ServiceType | null
): "NGOJEK" | "NGOMOBIL" {
  return service === "NGOMOBIL" ? "NGOMOBIL" : "NGOJEK";
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
 * COUNT driver idle (ONLINE) dalam radius — PostGIS ST_DWithin di Supabase.
 * Tanpa filter nama kota/provinsi administratif.
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

/** Cari driver idle terdekat secara global — hanya untuk debug_info, bukan bypass matching. */
export async function findNearestIdleDriverGlobal(
  admin: SupabaseClient,
  anchorLat: number,
  anchorLng: number,
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): Promise<NearestIdleDriver | null> {
  const category = resolveDriverCategoryForService(serviceType, packageVolumeCm3);

  const { data, error } = await admin
    .from("drivers")
    .select("id, current_lat, current_lng, service_category")
    .eq("status", "idle")
    .eq("service_category", category)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null)
    .limit(80);

  if (error || !data?.length) return null;

  let best: NearestIdleDriver | null = null;
  for (const row of data) {
    const dLat = Number(row.current_lat);
    const dLng = Number(row.current_lng);
    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) continue;

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
}

export type EvaluateDriverProximityOpts = {
  radiusKm?: number;
  packageVolumeCm3?: number;
};

/**
 * Ketersediaan driver murni radius GPS PostGIS — tanpa fallback atau dev mock.
 */
export async function evaluateDriverProximityAvailability(
  admin: SupabaseClient,
  rawLat: unknown,
  rawLng: unknown,
  serviceType: ServiceType = "NGOJEK",
  opts: EvaluateDriverProximityOpts = {}
): Promise<DriverAvailabilityResult> {
  const radiusKm = opts.radiusKm ?? CUSTOMER_DRIVER_RADIUS_KM;
  const parsed = parseCustomerCoords(rawLat, rawLng);
  const customerCoords: [number, number] = parsed.isValid
    ? [parsed.lat, parsed.lng]
    : [parsed.lat, parsed.lng];

  const logCheck = (
    count: number,
    coords: [number, number],
    code: DriverAvailabilityErrorCode
  ) => {
    console.log("Koordinat Customer:", coords[0], coords[1]);
    console.log("Jumlah Driver Terdekat < 3KM yang Online:", count);
    console.log("Layanan diminta:", serviceType);
    console.log("Availability:", code);
  };

  if (!parsed.isValid) {
    logCheck(0, customerCoords, "INVALID_COORDINATES");
    return buildAvailabilityResult(
      {
        available: false,
        error_code: "INVALID_COORDINATES",
        message: CUSTOMER_GPS_REQUIRED_MSG,
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

  let nearestDriver: NearestIdleDriver | null = null;

  try {
    const count = await countNearbyIdleDrivers(admin, parsed.lat, parsed.lng, {
      serviceType,
      packageVolumeCm3: opts.packageVolumeCm3,
      radiusKm,
    });

    nearestDriver = await findNearestIdleDriverGlobal(
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
    };

    if (count > 0) {
      logCheck(count, effectiveCoords, "AVAILABLE");
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

    logCheck(count, effectiveCoords, "NO_ONLINE_DRIVER_IN_RADIUS");

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "RPC error";
    const effectiveCoords: [number, number] = [parsed.lat, parsed.lng];
    console.error("Driver proximity RPC error:", message);

    return buildAvailabilityResult(
      {
        available: false,
        error_code: "RPC_ERROR",
        message,
        effective_lat: parsed.lat,
        effective_lng: parsed.lng,
        debug_info: {
          checked_drivers_count: 0,
          nearest_driver_km: nearestDriver?.distance_km ?? null,
          nearest_driver_id: nearestDriver?.driver_id ?? null,
          service_type: serviceType,
          radius_km: radiusKm,
        },
      },
      customerCoords,
      effectiveCoords
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
