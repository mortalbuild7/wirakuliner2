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
import {
  CUSTOMER_SESSION_EXPIRED_MSG,
  type DriverAvailabilityErrorCode,
} from "@/lib/driver-availability-types";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkDistributedRateLimit } from "@/lib/security/upstash-rate-limit";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
    server_error_detail: null,
    rpc_fallback_reason: null,
  };
}

function safeErrorResult(
  serviceType: ServiceType,
  lat: unknown,
  lng: unknown,
  messageOrError: string | unknown,
  errorCode: DriverAvailabilityErrorCode = "RPC_ERROR"
): DriverAvailabilityResult {
  const detail = extractServerErrorMessage(messageOrError);
  const customerLat = parseFloat(String(lat ?? "").trim());
  const customerLng = parseFloat(String(lng ?? "").trim());
  const coords: [number, number] = [
    Number.isFinite(customerLat) && !isNaN(customerLat) ? customerLat : 0,
    Number.isFinite(customerLng) && !isNaN(customerLng) ? customerLng : 0,
  ];

  return {
    available: false,
    error_code: errorCode,
    message: detail,
    effective_lat: coords[0],
    effective_lng: coords[1],
    debug_info: {
      ...emptyDebugInfo(serviceType),
      customer_coords: coords,
      effective_coords: coords,
      server_error_detail: detail,
    },
  };
}

async function assertCustomerSession(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      const detail = extractServerErrorMessage(error);
      console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
      return {
        ok: false,
        message: `[Auth] ${detail}`,
      };
    }

    if (!user?.id) {
      return {
        ok: false,
        message: CUSTOMER_SESSION_EXPIRED_MSG,
      };
    }

    return { ok: true, userId: user.id };
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return {
      ok: false,
      message: extractServerErrorMessage(error),
    };
  }
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
 * Cek ketersediaan driver dalam radius 3 km — selalu JSON, pesan error asli ke UI.
 */
export async function checkDriverAvailability(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<DriverAvailabilityResult> {
  try {
    const session = await assertCustomerSession();
    if (!session.ok) {
      const isSessionExpired =
        session.message === CUSTOMER_SESSION_EXPIRED_MSG ||
        session.message.toLowerCase().includes("sesi login");
      return safeErrorResult(
        serviceType,
        lat,
        lng,
        session.message,
        isSessionExpired ? "SESSION_EXPIRED" : "RPC_ERROR"
      );
    }

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
      return safeErrorResult(serviceType, lat, lng, error, "RPC_ERROR");
    }

    return await evaluateDriverProximityAvailability(admin, lat, lng, serviceType);
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return safeErrorResult(serviceType, lat, lng, error, "RPC_ERROR");
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
