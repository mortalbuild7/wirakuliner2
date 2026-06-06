import { haversineMeters } from "@/lib/geo-distance";

/** Radius meter — driver dianggap sudah sampai di titik navigasi. */
export const DRIVER_NAV_ARRIVAL_RADIUS_M = 75;

export type DriverNavTarget = "merchant" | "customer";

export function driverNavTargetLabel(target: DriverNavTarget): string {
  return target === "merchant" ? "T" : "C";
}

export function driverNavTargetColor(target: DriverNavTarget): string {
  return target === "merchant" ? "#f97316" : "#22d3ee";
}

export function hasReachedNavDestination(
  driver: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  radiusM = DRIVER_NAV_ARRIVAL_RADIUS_M
): boolean {
  return (
    haversineMeters(driver.lat, driver.lng, destination.lat, destination.lng) <= radiusM
  );
}
