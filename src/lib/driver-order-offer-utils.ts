import { isOnsiteOrder } from "@/lib/order-channel";

/** Jeda respons driver sebelum rotasi ke KPI berikutnya (15 detik). */
export const DRIVER_OFFER_TIMEOUT_MS = 15_000;

export type OfferableOrder = {
  id: string;
  driver_id: string | null;
  offered_driver_id: string | null;
  offered_at: string | null;
  offer_skip_driver_ids: string[] | null;
  order_status: string;
  delivery_address: string;
  negotiation_status: string;
  service_city_id?: string | null;
  operational_cluster_id?: string | null;
};

export type RotateOfferResult = {
  driverId: string | null;
  changed: boolean;
  priorityScore?: number;
  distanceKm?: number;
};

export function isOfferExpired(offeredAt: string | null | undefined): boolean {
  if (!offeredAt) return true;
  return Date.now() - new Date(offeredAt).getTime() >= DRIVER_OFFER_TIMEOUT_MS;
}

export function offerSecondsLeft(offeredAt: string | null | undefined): number {
  if (!offeredAt) return 0;
  const left = DRIVER_OFFER_TIMEOUT_MS - (Date.now() - new Date(offeredAt).getTime());
  return Math.max(0, Math.ceil(left / 1000));
}

export function orderNeedsOfferRotation(order: OfferableOrder): boolean {
  if (order.driver_id) return false;
  if (isOnsiteOrder(order.delivery_address)) return false;
  return ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);
}
