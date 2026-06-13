import type { ServiceType } from "@/lib/service-types";

/** Kode diagnosis ketersediaan driver — untuk UI & log. */
export type DriverAvailabilityErrorCode =
  | "AVAILABLE"
  | "INVALID_COORDINATES"
  | "NO_ONLINE_DRIVER_IN_RADIUS"
  | "RPC_ERROR"
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
