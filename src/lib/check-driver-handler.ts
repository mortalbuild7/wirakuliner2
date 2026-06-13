import "server-only";

import {
  CUSTOMER_DRIVER_RADIUS_KM,
  evaluateDriverProximityAvailability,
} from "@/lib/customer-driver-match";
import {
  CUSTOMER_SESSION_EXPIRED_MSG,
  DEV_MOCK_CUSTOMER_ID,
  formatServerCrashMessage,
  toDriverAvailabilityResponse,
  type DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import { getClientIp } from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { checkDistributedRateLimit } from "@/lib/security/upstash-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isServiceType, type ServiceType } from "@/lib/service-types";

import type {
  CheckDriverApiFailure,
  CheckDriverApiResponse,
  CheckDriverApiSuccess,
} from "@/lib/check-driver-types";

function allowDevMockCustomerSession(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_WIRA_DEV_MOCK_AUTH === "true"
  );
}

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

function failure(error: unknown): CheckDriverApiFailure {
  return {
    success: false,
    error: extractServerErrorMessage(error),
  };
}

function toSuccess(result: DriverAvailabilityResult): CheckDriverApiSuccess {
  const normalized = toDriverAvailabilityResponse(result);
  return {
    success: true,
    available: normalized.available,
    error_code: normalized.error_code,
    message: normalized.message,
    error_message: normalized.error_message,
    effective_lat: normalized.effective_lat,
    effective_lng: normalized.effective_lng,
    debug_info: normalized.debug_info,
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
      if (allowDevMockCustomerSession()) {
        console.warn("[check-driver] auth error — pakai mock customer id (dev)");
        return { ok: true, userId: DEV_MOCK_CUSTOMER_ID };
      }
      return { ok: false, message: `[Auth] ${detail}` };
    }

    if (!user?.id) {
      if (allowDevMockCustomerSession()) {
        console.warn("[check-driver] session kosong — pakai mock customer id (dev)");
        return { ok: true, userId: DEV_MOCK_CUSTOMER_ID };
      }
      return { ok: false, message: CUSTOMER_SESSION_EXPIRED_MSG };
    }

    return { ok: true, userId: user.id };
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    if (allowDevMockCustomerSession()) {
      return { ok: true, userId: DEV_MOCK_CUSTOMER_ID };
    }
    return { ok: false, message: extractServerErrorMessage(error) };
  }
}

async function checkDriverMatchRateLimit(req: Request): Promise<{
  allowed: boolean;
  message?: string;
}> {
  try {
    const ip = getClientIp(req);
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
 * Pengecekan ketersediaan driver — hanya untuk API Route (bukan Server Action render).
 */
export async function runCheckDriverAvailability(
  req: Request,
  lat: unknown,
  lng: unknown,
  serviceTypeRaw: unknown = "NGOJEK"
): Promise<CheckDriverApiResponse> {
  const serviceType: ServiceType = isServiceType(serviceTypeRaw)
    ? serviceTypeRaw
    : "NGOJEK";

  try {
    const session = await assertCustomerSession();
    if (!session.ok) {
      return failure(session.message);
    }

    const rate = await checkDriverMatchRateLimit(req);
    if (!rate.allowed) {
      return failure(rate.message ?? "Terlalu banyak permintaan. Coba lagi nanti.");
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
      return toSuccess(
        toDriverAvailabilityResponse({
          available: true,
          error_code: "NON_TRANSIT_SERVICE",
          effective_lat: coords[0],
          effective_lng: coords[1],
          debug_info: {
            ...emptyDebugInfo(serviceType),
            customer_coords: coords,
            effective_coords: coords,
          },
        })
      );
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (error) {
      console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
      return failure(error);
    }

    const result = await evaluateDriverProximityAvailability(
      admin,
      lat,
      lng,
      serviceType
    );
    const normalized = toDriverAvailabilityResponse(result);
    if (
      !normalized.available &&
      (normalized.error_code === "RPC_ERROR" ||
        normalized.error_code === "SESSION_EXPIRED")
    ) {
      return failure(
        normalized.debug_info?.server_error_detail ??
          normalized.message ??
          normalized.error_code
      );
    }
    return toSuccess(normalized);
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return failure(formatServerCrashMessage(error));
  }
}
