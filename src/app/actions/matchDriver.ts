"use server";

import { runCheckDriverAvailability } from "@/lib/check-driver-handler";
import {
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  MAX_RADIUS_METERS,
  checkDriverAvailabilityServer,
  type DriverAvailabilityResult,
} from "@/lib/customer-driver-match";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceType } from "@/lib/service-types";

export {
  MAX_RADIUS_METERS,
  CUSTOMER_DRIVER_RADIUS_KM,
  EMPTY_DRIVER_ZONE_MESSAGE,
  type DriverAvailabilityResult,
};

/**
 * @deprecated Gunakan `POST /api/check-driver` dari client — hindari Server Action render crash.
 */
export async function checkDriverAvailability(
  lat: unknown,
  lng: unknown,
  serviceType: ServiceType = "NGOJEK"
): Promise<DriverAvailabilityResult> {
  const req = new Request("https://wirakuliner.web.id/api/check-driver", {
    method: "POST",
  });
  const api = await runCheckDriverAvailability(req, lat, lng, serviceType);
  if (!api.success) {
    return {
      available: false,
      success: false,
      error_code: "RPC_ERROR",
      message: api.error,
      error_message: api.error,
      effective_lat: 0,
      effective_lng: 0,
      debug_info: {
        customer_coords: [0, 0],
        effective_coords: [0, 0],
        checked_drivers_count: 0,
        nearest_driver_km: null,
        nearest_driver_id: null,
        service_type: serviceType,
        radius_km: CUSTOMER_DRIVER_RADIUS_KM,
        server_error_detail: api.error,
        rpc_fallback_reason: null,
      },
    };
  }
  return {
    available: api.available,
    success: api.available,
    error_code: api.error_code,
    message: api.message,
    error_message: api.error_message,
    effective_lat: api.effective_lat,
    effective_lng: api.effective_lng,
    debug_info: api.debug_info,
  };
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
