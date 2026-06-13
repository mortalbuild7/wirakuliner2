"use server";

import { headers } from "next/headers";
import {
  checkDriverAvailabilityServer,
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

function emptyDebugInfo(serviceType: ServiceType): DriverAvailabilityResult["debug_info"] {
  return {
    customer_coords: [0, 0],
    effective_coords: [0, 0],
    checked_drivers_count: 0,
    nearest_driver_km: null,
    nearest_driver_id: null,
    service_type: serviceType,
    radius_km: CUSTOMER_DRIVER_RADIUS_KM,
  };
}

function safeErrorResult(
  serviceType: ServiceType,
  lat: unknown,
  lng: unknown,
  message: string,
  errorCode: DriverAvailabilityResult["error_code"] = "RPC_ERROR"
): DriverAvailabilityResult {
  const customerLat = parseFloat(String(lat ?? "").trim());
  const customerLng = parseFloat(String(lng ?? "").trim());
  const coords: [number, number] = [
    Number.isFinite(customerLat) && !isNaN(customerLat) ? customerLat : 0,
    Number.isFinite(customerLng) && !isNaN(customerLng) ? customerLng : 0,
  ];

  return {
    available: false,
    error_code: errorCode,
    message,
    effective_lat: coords[0],
    effective_lng: coords[1],
    debug_info: {
      ...emptyDebugInfo(serviceType),
      customer_coords: coords,
      effective_coords: coords,
    },
  };
}

async function checkDriverMatchRateLimit(): Promise<{
  allowed: boolean;
  message?: string;
}> {
  try {
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
      return {
        allowed: false,
        message: "Terlalu banyak permintaan. Coba lagi nanti.",
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return { allowed: true };
  }
}

/**
 * Cek ketersediaan driver dalam radius 3 km — selalu mengembalikan objek JSON, tidak throw.
 */
export async function checkDriverAvailability(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<DriverAvailabilityResult> {
  try {
    const rate = await checkDriverMatchRateLimit();
    if (!rate.allowed) {
      return safeErrorResult(
        serviceType,
        lat,
        lng,
        rate.message ?? "Terlalu banyak permintaan. Coba lagi nanti.",
        "RPC_ERROR"
      );
    }

    if (
      serviceType !== "NGOJEK" &&
      serviceType !== "NGOMOBIL" &&
      serviceType !== "PAKET"
    ) {
      const customerLat = parseFloat(String(lat ?? "").trim());
      const customerLng = parseFloat(String(lng ?? "").trim());
      const coords: [number, number] = [
        Number.isFinite(customerLat) && !isNaN(customerLat) ? customerLat : 0,
        Number.isFinite(customerLng) && !isNaN(customerLng) ? customerLng : 0,
      ];
      return {
        available: true,
        error_code: "NON_TRANSIT_SERVICE",
        effective_lat: coords[0],
        effective_lng: coords[1],
        debug_info: {
          ...emptyDebugInfo(serviceType),
          customer_coords: coords,
          effective_coords: coords,
        },
      };
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (error) {
      console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
      return safeErrorResult(
        serviceType,
        lat,
        lng,
        "Gagal memeriksa ketersediaan driver. Coba lagi."
      );
    }

    return await evaluateDriverProximityAvailability(admin, lat, lng, serviceType);
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return safeErrorResult(
      serviceType,
      lat,
      lng,
      "Gagal memeriksa ketersediaan driver. Coba lagi."
    );
  }
}

/** Jumlah driver terdekat (debug / admin preview). */
export async function getNearbyDriverCount(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<number> {
  try {
    const admin = createAdminClient();
    const result = await checkDriverAvailabilityServer(admin, lat, lng, serviceType);
    return result.debug_info.checked_drivers_count;
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return 0;
  }
}
