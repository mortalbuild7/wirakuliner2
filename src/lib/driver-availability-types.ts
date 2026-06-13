import type { ServiceType } from "@/lib/service-types";
import { extractServerErrorMessage } from "@/lib/server-error-message";

/** Kode diagnosis ketersediaan driver — untuk UI & log. */
export type DriverAvailabilityErrorCode =
  | "AVAILABLE"
  | "INVALID_COORDINATES"
  | "NO_ONLINE_DRIVER_IN_RADIUS"
  | "RPC_ERROR"
  | "SESSION_EXPIRED"
  | "NON_TRANSIT_SERVICE";

export type DriverAvailabilityDebugInfo = {
  customer_coords: [number, number];
  effective_coords: [number, number];
  checked_drivers_count: number;
  nearest_driver_km: number | null;
  nearest_driver_id: string | null;
  service_type: ServiceType;
  radius_km: number;
  /** `postgis` = RPC Supabase; `haversine` = kalkulator lokal cadangan. */
  match_engine?: "postgis" | "haversine";
  /** Pesan error mentah dari server — untuk alert di HP. */
  server_error_detail?: string | null;
  /** Alasan RPC diganti Haversine (jika fallback aktif). */
  rpc_fallback_reason?: string | null;
};

export type DriverAvailabilityResult = {
  available: boolean;
  success?: boolean;
  error_code: DriverAvailabilityErrorCode;
  message?: string;
  /** Pesan transparan untuk alert debug di HP Customer. */
  error_message?: string;
  effective_lat: number;
  effective_lng: number;
  debug_info: DriverAvailabilityDebugInfo;
};

/** UUID tiruan customer — hanya saat dev / mock auth diaktifkan. */
export const DEV_MOCK_CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";

export function formatServerCrashMessage(error: unknown): string {
  const detail = extractServerErrorMessage(error);
  return `Server Crash: ${detail}`;
}

export function toDriverAvailabilityResponse(
  result: DriverAvailabilityResult
): DriverAvailabilityResult {
  const detail =
    result.debug_info?.server_error_detail?.trim() ||
    result.message?.trim() ||
    result.error_code;

  const isCrash =
    !result.available &&
    (result.error_code === "RPC_ERROR" || result.error_code === "SESSION_EXPIRED");

  return {
    ...result,
    success: result.available,
    error_message: isCrash ? `Server Crash: ${detail}` : undefined,
  };
}

export function isTransitProximityService(
  serviceType: ServiceType
): boolean {
  return serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType === "PAKET";
}

export const CUSTOMER_SESSION_EXPIRED_MSG =
  "Sesi login di HP Anda habis, mohon login ulang";
