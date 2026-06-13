import type { Driver, DriverStatus } from "@/types/database";

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  offline: "Offline",
  idle: "Siap terima order",
  delivering: "Sedang mengantar",
};

/** Label ringkas untuk tombol ketersediaan di layar sempit (APK driver). */
export const DRIVER_STATUS_TOGGLE_LABEL: Record<
  DriverStatus,
  { title: string; subtitle?: string }
> = {
  offline: { title: "Offline" },
  idle: { title: "Siap", subtitle: "terima order" },
  delivering: { title: "Antar", subtitle: "aktif" },
};

export function driverDisplayName(driver: Pick<Driver, "name" | "vehicle_plate">) {
  return driver.vehicle_plate
    ? `${driver.name} · ${driver.vehicle_plate}`
    : driver.name;
}
