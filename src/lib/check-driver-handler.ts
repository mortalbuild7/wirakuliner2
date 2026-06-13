import "server-only";

import {
  evaluateDriverProximityAvailability,
} from "@/lib/customer-driver-match";
import {
  CUSTOMER_SESSION_EXPIRED_MSG,
  DEV_MOCK_CUSTOMER_ID,
  formatServerCrashMessage,
  toDriverAvailabilityResponse,
  type DriverAvailabilityResult,
} from "@/lib/driver-availability-types";
import {
  isAkapTransitService,
  isTransitProximityServiceType,
  OUTSIDE_JABODETABEK_MESSAGE,
  resolvePickupRadiusKm,
} from "@/lib/jabodetabek-policy";
import { assertPickupInJabodetabekCluster } from "@/lib/jabodetabek-policy-server";
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

export type CheckDriverRequestInput = {
  lat: unknown;
  lng: unknown;
  serviceType?: unknown;
  packageVolumeCm3?: unknown;
  quotedFare?: unknown;
};

function allowDevMockCustomerSession(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_WIRA_DEV_MOCK_AUTH === "true"
  );
}

function emptyDebugInfo(
  serviceType: ServiceType,
  radiusKm: number
): DriverAvailabilityResult["debug_info"] {
  return {
    customer_coords: [0, 0],
    effective_coords: [0, 0],
    checked_drivers_count: 0,
    nearest_driver_km: null,
    nearest_driver_id: null,
    service_type: serviceType,
    radius_km: radiusKm,
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

function parsePackageVolume(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseQuotedFare(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
        return { ok: true, userId: DEV_MOCK_CUSTOMER_ID };
      }
      return { ok: false, message: `[Auth] ${detail}` };
    }

    if (!user?.id) {
      if (allowDevMockCustomerSession()) {
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
 * Pengecekan ketersediaan driver — cluster JABODETABEK + radius jemput dinamis.
 */
export async function runCheckDriverAvailability(
  req: Request,
  input: CheckDriverRequestInput
): Promise<CheckDriverApiResponse> {
  const serviceType: ServiceType = isServiceType(input.serviceType)
    ? input.serviceType
    : "NGOJEK";
  const packageVolumeCm3 = parsePackageVolume(input.packageVolumeCm3);
  const quotedFare = parseQuotedFare(input.quotedFare);
  const pickupRadiusKm = resolvePickupRadiusKm(serviceType, packageVolumeCm3);

  try {
    const session = await assertCustomerSession();
    if (!session.ok) {
      return failure(session.message);
    }

    const rate = await checkDriverMatchRateLimit(req);
    if (!rate.allowed) {
      return failure(rate.message ?? "Terlalu banyak permintaan. Coba lagi nanti.");
    }

    if (!isTransitProximityServiceType(serviceType)) {
      const customerLat = parseFloat(String(input.lat ?? "").trim());
      const customerLng = parseFloat(String(input.lng ?? "").trim());
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
            ...emptyDebugInfo(serviceType, pickupRadiusKm),
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

    const parsedLat = parseFloat(String(input.lat ?? "").trim());
    const parsedLng = parseFloat(String(input.lng ?? "").trim());
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return toSuccess(
        toDriverAvailabilityResponse({
          available: false,
          error_code: "INVALID_COORDINATES",
          message: "Koordinat GPS tidak valid",
          effective_lat: 0,
          effective_lng: 0,
          debug_info: emptyDebugInfo(serviceType, pickupRadiusKm),
        })
      );
    }

    const clusterCheck = await assertPickupInJabodetabekCluster(
      admin,
      parsedLat,
      parsedLng
    );
    if (!clusterCheck.ok) {
      return toSuccess(
        toDriverAvailabilityResponse({
          available: false,
          error_code: "NO_ONLINE_DRIVER_IN_RADIUS",
          message: clusterCheck.message ?? OUTSIDE_JABODETABEK_MESSAGE,
          effective_lat: parsedLat,
          effective_lng: parsedLng,
          debug_info: {
            ...emptyDebugInfo(serviceType, pickupRadiusKm),
            customer_coords: [parsedLat, parsedLng],
            effective_coords: [parsedLat, parsedLng],
            server_error_detail: clusterCheck.message,
          },
        })
      );
    }

    const result = await evaluateDriverProximityAvailability(
      admin,
      input.lat,
      input.lng,
      serviceType,
      { radiusKm: pickupRadiusKm, packageVolumeCm3 }
    );

    const normalized = toDriverAvailabilityResponse(result);

    if (
      isAkapTransitService(serviceType, packageVolumeCm3) &&
      quotedFare > 0 &&
      clusterCheck.ok
    ) {
      return toSuccess({
        ...normalized,
        available: true,
        error_code: "AVAILABLE",
        message: undefined,
        error_message: undefined,
        debug_info: {
          ...normalized.debug_info,
          radius_km: pickupRadiusKm,
        },
      });
    }

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

    return toSuccess({
      ...normalized,
      debug_info: {
        ...normalized.debug_info,
        radius_km: pickupRadiusKm,
      },
    });
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return failure(formatServerCrashMessage(error));
  }
}

/** @deprecated — gunakan objek input. */
export async function runCheckDriverAvailabilityLegacy(
  req: Request,
  lat: unknown,
  lng: unknown,
  serviceTypeRaw: unknown = "NGOJEK"
): Promise<CheckDriverApiResponse> {
  return runCheckDriverAvailability(req, {
    lat,
    lng,
    serviceType: serviceTypeRaw,
  });
}
