import type { OrderStatus } from "@/types/database";

/** Status DB → semantik pelacakan (ON_DELIVERY / ARRIVED / SUCCESS). */
export function isOnDeliveryStatus(status: OrderStatus): boolean {
  return status === "on_the_way";
}

export function isArrivedOrSuccessStatus(status: OrderStatus): boolean {
  return status === "delivered";
}
