"use server";

import { headers } from "next/headers";
import {
  checkDriverAvailabilityServer,
  countNearbyIdleDrivers,
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  MAX_RADIUS_METERS,
} from "@/lib/customer-driver-match";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkDistributedRateLimit } from "@/lib/security/upstash-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceType } from "@/lib/service-types";

export { MAX_RADIUS_METERS, CUSTOMER_DRIVER_RADIUS_KM, EMPTY_DRIVER_ZONE_MESSAGE };

function clampCoord(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

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
 * Cek apakah ada driver online (idle) dalam radius 3 km dari titik jemput.
 * Dipanggil dari UI customer sebelum order dibuat.
 */
export async function checkDriverAvailability(
  lat: number,
  lng: number,
  serviceType: ServiceType = "NGOJEK"
): Promise<boolean> {
  await assertDriverMatchRateLimit();
  const safeLat = clampCoord(lat, -90, 90);
  const safeLng = clampCoord(lng, -180, 180);
  if (safeLat == null || safeLng == null) return false;

  if (serviceType !== "NGOJEK" && serviceType !== "NGOMOBIL") {
    return true;
  }

  const admin = createAdminClient();
  const count = await countNearbyIdleDrivers(admin, safeLat, safeLng, { serviceType });
  console.log("Koordinat Customer:", safeLat, safeLng);
  console.log("Jumlah Driver Terdekat < 3KM yang Online:", count);
  return count > 0;
}

/** Opsional: jumlah driver terdekat (debug / admin preview). */
export async function getNearbyDriverCount(
  lat: number,
  lng: number,
  serviceType: ServiceType = "NGOJEK"
): Promise<number> {
  const safeLat = clampCoord(lat, -90, 90);
  const safeLng = clampCoord(lng, -180, 180);
  if (safeLat == null || safeLng == null) return 0;

  const admin = createAdminClient();
  return countNearbyIdleDrivers(admin, safeLat, safeLng, { serviceType });
}
