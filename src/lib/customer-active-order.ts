import type { OrderStatus, ServiceType } from "@/types/database";
import { isTransitOrderRecord } from "@/lib/order-channel";

export type ActiveTransitOrderRecord = {
  id: string;
  order_status: OrderStatus;
  delivery_address: string;
  service_type?: ServiceType | null;
  driver_id?: string | null;
};

export type ActiveTransitOrderHint = {
  id: string;
  order_status: OrderStatus;
  delivery_address: string;
  service_type?: ServiceType | null;
  driver_id?: string | null;
  updated_at: string;
};

/** Status pesanan yang masih berjalan (belum selesai / dibatalkan). */
export const CUSTOMER_ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
];

export const WIRA_ACTIVE_TRANSIT_ORDER_KEY = "wira_customer_active_transit_order";

export function isCustomerActiveOrderStatus(status: OrderStatus): boolean {
  return CUSTOMER_ACTIVE_ORDER_STATUSES.includes(status);
}

export function readActiveTransitOrderHint(): ActiveTransitOrderHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WIRA_ACTIVE_TRANSIT_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTransitOrderHint;
    if (!parsed?.id || !parsed.order_status) return null;
    if (!isCustomerActiveOrderStatus(parsed.order_status)) {
      localStorage.removeItem(WIRA_ACTIVE_TRANSIT_ORDER_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistActiveTransitOrderHint(hint: ActiveTransitOrderHint): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIRA_ACTIVE_TRANSIT_ORDER_KEY, JSON.stringify(hint));
  } catch {
    /* ignore quota */
  }
}

export function clearActiveTransitOrderHint(orderId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!orderId) {
      localStorage.removeItem(WIRA_ACTIVE_TRANSIT_ORDER_KEY);
      return;
    }
    const current = readActiveTransitOrderHint();
    if (current?.id === orderId) {
      localStorage.removeItem(WIRA_ACTIVE_TRANSIT_ORDER_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Sinkronkan hint beranda dari data order terbaru. */
export function syncActiveTransitOrderFromOrder(order: ActiveTransitOrderRecord): void {
  if (!isTransitOrderRecord(order)) return;
  if (isCustomerActiveOrderStatus(order.order_status)) {
    persistActiveTransitOrderHint({
      id: order.id,
      order_status: order.order_status,
      delivery_address: order.delivery_address,
      service_type: order.service_type ?? null,
      driver_id: order.driver_id ?? null,
      updated_at: new Date().toISOString(),
    });
  } else {
    clearActiveTransitOrderHint(order.id);
  }
}
