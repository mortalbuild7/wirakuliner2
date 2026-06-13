import type { DriverAvailabilityResult } from "@/lib/driver-availability-types";

export type CheckDriverApiSuccess = {
  success: true;
  available: boolean;
  error_code: DriverAvailabilityResult["error_code"];
  message?: string;
  error_message?: string;
  effective_lat: number;
  effective_lng: number;
  debug_info: DriverAvailabilityResult["debug_info"];
};

export type CheckDriverApiFailure = {
  success: false;
  error: string;
};

export type CheckDriverApiResponse = CheckDriverApiSuccess | CheckDriverApiFailure;
