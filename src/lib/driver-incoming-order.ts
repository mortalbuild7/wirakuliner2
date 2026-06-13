import { haversineKm } from "@/lib/geo-config";
import {
  MOBIL_PICKUP_RADIUS_KM,
  MOTOR_PICKUP_RADIUS_KM,
  resolvePickupRadiusKm,
} from "@/lib/jabodetabek-policy";
import { isOnsiteOrder, NGOMOBIL_ADDRESS_PREFIX } from "@/lib/order-channel";
import type { DriverServiceCategory, ServiceType } from "@/lib/service-types";
import { resolveDriverCategoryForService } from "@/lib/service-types";

/** Status order yang ditawarkan ke driver (bukan SEARCHING/PENDING legacy). */
export const DRIVER_INCOMING_ORDER_STATUSES = [
  "paid",
  "preparing",
  "ready_for_pickup",
] as const;

export type DriverIncomingOrderRow = {
  id?: string;
  order_status?: string | null;
  service_type?: string | null;
  delivery_address?: string | null;
  driver_id?: string | null;
  offered_driver_id?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
};

/** Normalisasi layanan order — NGOMOBIL, CAR, atau prefix alamat. */
export function resolveOrderServiceType(
  order: Pick<DriverIncomingOrderRow, "service_type" | "delivery_address">
): ServiceType | null {
  const raw = String(order.service_type ?? "")
    .trim()
    .toUpperCase();
  if (raw === "NGOMOBIL" || raw === "CAR") return "NGOMOBIL";
  if (raw === "NGOJEK") return "NGOJEK";
  if (raw === "PAKET") return "PAKET";

  const addr = order.delivery_address ?? "";
  if (addr.startsWith(NGOMOBIL_ADDRESS_PREFIX)) return "NGOMOBIL";
  if (addr.startsWith("[NGOJEK]")) return "NGOJEK";
  if (addr.startsWith("[PAKET]")) return "PAKET";
  return null;
}

export function isNgomobilIncomingOrder(
  order: Pick<DriverIncomingOrderRow, "service_type" | "delivery_address">
): boolean {
  return resolveOrderServiceType(order) === "NGOMOBIL";
}

export function isDriverIncomingOrderStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (DRIVER_INCOMING_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Bypass testing: MOBIL_PASSENGER selalu menerima NGOMOBIL tanpa pengecekan string ketat.
 */
export function driverCategoryAcceptsOrderService(
  category: DriverServiceCategory | string | null | undefined,
  serviceType: ServiceType | null
): boolean {
  if (!serviceType) return true;
  if (serviceType === "NGOMOBIL") {
    return (
      !category ||
      category === "MOBIL_PASSENGER" ||
      category === "MOBIL_CARGO" ||
      category === "MOTOR_HYBRID"
    );
  }
  const required = resolveDriverCategoryForService(serviceType, 0);
  return !category || category === required;
}

export function pickupWithinDriverRadius(
  driverLat: number,
  driverLng: number,
  pickupLat: number,
  pickupLng: number,
  serviceType: ServiceType | null
): boolean {
  const radiusKm =
    serviceType != null
      ? resolvePickupRadiusKm(serviceType, 0)
      : MOBIL_PICKUP_RADIUS_KM;
  const dist = haversineKm(driverLat, driverLng, pickupLat, pickupLng);
  return dist <= radiusKm;
}

/** Order baru masuk yang relevan untuk driver (penawaran langsung atau NGOMOBIL di radius). */
export function isRelevantIncomingOrderForDriver(
  order: DriverIncomingOrderRow,
  driver: {
    id: string;
    current_lat?: number | null;
    current_lng?: number | null;
    service_category?: DriverServiceCategory | string | null;
  },
  isOnline: boolean
): boolean {
  if (!isOnline || !order.id) return false;
  if (order.driver_id) return order.driver_id === driver.id;
  if (!isDriverIncomingOrderStatus(order.order_status ?? null)) return false;
  if (isOnsiteOrder(order.delivery_address ?? "")) return false;

  if (order.offered_driver_id === driver.id) return true;

  const serviceType = resolveOrderServiceType(order);
  if (!isNgomobilIncomingOrder(order)) return false;
  if (!driverCategoryAcceptsOrderService(driver.service_category, serviceType)) {
    return false;
  }

  const dLat = driver.current_lat;
  const dLng = driver.current_lng;
  const pLat = order.pickup_lat;
  const pLng = order.pickup_lng;
  if (
    dLat == null ||
    dLng == null ||
    pLat == null ||
    pLng == null ||
    !Number.isFinite(dLat) ||
    !Number.isFinite(dLng) ||
    !Number.isFinite(pLat) ||
    !Number.isFinite(pLng)
  ) {
    return serviceType === "NGOMOBIL";
  }

  return pickupWithinDriverRadius(dLat, dLng, pLat, pLng, serviceType);
}

export const DRIVER_INCOMING_ALERT_MESSAGE = "ADA ORDERAN MASUK JABODETABEK!";

export function defaultPickupRadiusKm(serviceType: ServiceType | null): number {
  if (serviceType === "NGOMOBIL") return MOBIL_PICKUP_RADIUS_KM;
  if (serviceType === "NGOJEK") return MOTOR_PICKUP_RADIUS_KM;
  return MOBIL_PICKUP_RADIUS_KM;
}
