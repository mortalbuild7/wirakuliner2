import type { ServiceType } from "@/lib/service-types";

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
  error_code: DriverAvailabilityErrorCode;
  message?: string;
  effective_lat: number;
  effective_lng: number;
  debug_info: DriverAvailabilityDebugInfo;
};

export function isTransitProximityService(
  serviceType: ServiceType
): boolean {
  return serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType === "PAKET";
}

export const CUSTOMER_SESSION_EXPIRED_MSG =
  "Sesi login di HP Anda habis, mohon login ulang";
