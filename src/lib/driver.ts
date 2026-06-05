import type { Driver, DriverStatus } from "@/types/database";

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  offline: "Offline",
  idle: "Siap terima order",
  delivering: "Sedang mengantar",
};

export function driverDisplayName(driver: Pick<Driver, "name" | "vehicle_plate">) {
  return driver.vehicle_plate
    ? `${driver.name} · ${driver.vehicle_plate}`
    : driver.name;
}
