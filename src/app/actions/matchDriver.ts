"use server";

import { headers } from "next/headers";
import {
  checkDriverAvailabilityServer,
  countNearbyIdleDrivers,
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  evaluateDriverProximityAvailability,
  MAX_RADIUS_METERS,
  type DriverAvailabilityResult,
} from "@/lib/customer-driver-match";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkDistributedRateLimit } from "@/lib/security/upstash-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceType } from "@/lib/service-types";

export {
  MAX_RADIUS_METERS,
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  type DriverAvailabilityResult,
};

async function assertDriverMatchRateLimit(): Promise<void> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const result = await checkDistributedRateLimit(
    "driver-match-check",
    ip,
    RATE_LIMITS.driverMatchCheck
  );
  if (!result.allowed) {
    throw new Error("Terlalu banyak permintaan. Coba lagi nanti.");
  }
}

/**
 * Cek ketersediaan driver dalam radius 3 km — murni GPS + respons debug terstruktur.
 * Menerima koordinat string/number dari form atau browser.
 */
export async function checkDriverAvailability(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<DriverAvailabilityResult> {
  await assertDriverMatchRateLimit();

  if (serviceType !== "NGOJEK" && serviceType !== "NGOMOBIL" && serviceType !== "PAKET") {
    return {
      available: true,
      error_code: "NON_TRANSIT_SERVICE",
      effective_lat: Number(lat) || 0,
      effective_lng: Number(lng) || 0,
      debug_info: {
        customer_coords: [Number(lat) || 0, Number(lng) || 0],
        effective_coords: [Number(lat) || 0, Number(lng) || 0],
        checked_drivers_count: 0,
        nearest_driver_km: null,
        nearest_driver_id: null,
        service_type: serviceType,
        radius_km: CUSTOMER_DRIVER_RADIUS_KM,
      },
    };
  }

  const admin = createAdminClient();
  return evaluateDriverProximityAvailability(admin, lat, lng, serviceType);
}

/** Jumlah driver terdekat (debug / admin preview). */
export async function getNearbyDriverCount(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<number> {
  const admin = createAdminClient();
  const result = await checkDriverAvailabilityServer(admin, lat, lng, serviceType);
  return result.debug_info.checked_drivers_count;
}
