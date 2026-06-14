import type { OrderStatus, ServiceType } from "@/types/database";

export type ActiveCustomerOrderRecord = {
  id: string;
  order_status: OrderStatus;
  delivery_address: string;
  service_type?: ServiceType | null;
  driver_id?: string | null;
  merchant_name?: string | null;
};

export type ActiveCustomerOrderHint = ActiveCustomerOrderRecord & {
  updated_at: string;
};

/** @deprecated Gunakan ActiveCustomerOrderRecord */
export type ActiveTransitOrderRecord = ActiveCustomerOrderRecord;

/** @deprecated Gunakan ActiveCustomerOrderHint */
export type ActiveTransitOrderHint = ActiveCustomerOrderHint;

/** Status pesanan yang masih berjalan (belum selesai / dibatalkan). */
export const CUSTOMER_ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
];

export const WIRA_ACTIVE_ORDERS_KEY = "wira_customer_active_orders";
/** @deprecated */
export const WIRA_ACTIVE_TRANSIT_ORDER_KEY = WIRA_ACTIVE_ORDERS_KEY;
export const WIRA_ACTIVE_ORDER_CHANGED_EVENT = "wira:active-order-changed";

const MAX_HINTS = 10;

function dispatchActiveOrderChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WIRA_ACTIVE_ORDER_CHANGED_EVENT));
}

export function isCustomerActiveOrderStatus(status: OrderStatus): boolean {
  return CUSTOMER_ACTIVE_ORDER_STATUSES.includes(status);
}

/** Tujuan banner: bayar jika belum lunas, lacak jika sudah dibayar. */
export function customerActiveOrderHref(
  order: Pick<ActiveCustomerOrderRecord, "id" | "order_status">
): string {
  if (order.order_status === "pending_payment") {
    return `/customer/orders/${order.id}/pay`;
  }
  return `/customer/orders/${order.id}`;
}

function migrateLegacySingleHint(): ActiveCustomerOrderHint[] {
  if (typeof window === "undefined") return [];
  try {
    const legacy = localStorage.getItem("wira_customer_active_transit_order");
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as ActiveCustomerOrderHint;
    localStorage.removeItem("wira_customer_active_transit_order");
    if (parsed?.id && isCustomerActiveOrderStatus(parsed.order_status)) {
      localStorage.setItem(WIRA_ACTIVE_ORDERS_KEY, JSON.stringify([parsed]));
      return [parsed];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function readActiveOrdersHint(): ActiveCustomerOrderHint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WIRA_ACTIVE_ORDERS_KEY);
    if (!raw) return migrateLegacySingleHint();
    const parsed = JSON.parse(raw) as ActiveCustomerOrderHint[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o) => o?.id && o.order_status && isCustomerActiveOrderStatus(o.order_status)
    );
  } catch {
    return [];
  }
}

/** @deprecated Gunakan readActiveOrdersHint()[0] */
export function readActiveTransitOrderHint(): ActiveCustomerOrderHint | null {
  return readActiveOrdersHint()[0] ?? null;
}

export function persistActiveOrdersHint(
  hints: ActiveCustomerOrderHint[],
  options?: { silent?: boolean }
): void {
  if (typeof window === "undefined") return;
  try {
    const valid = hints
      .filter((o) => o?.id && isCustomerActiveOrderStatus(o.order_status))
      .slice(0, MAX_HINTS);
    if (valid.length === 0) {
      localStorage.removeItem(WIRA_ACTIVE_ORDERS_KEY);
    } else {
      localStorage.setItem(WIRA_ACTIVE_ORDERS_KEY, JSON.stringify(valid));
    }
    if (!options?.silent) dispatchActiveOrderChanged();
  } catch {
    /* ignore quota */
  }
}

export function upsertActiveOrderHint(
  hint: ActiveCustomerOrderHint,
  options?: { silent?: boolean }
): void {
  const list = readActiveOrdersHint().filter((o) => o.id !== hint.id);
  list.unshift(hint);
  persistActiveOrdersHint(list, options);
}

/** @deprecated Gunakan upsertActiveOrderHint */
export function persistActiveTransitOrderHint(
  hint: ActiveCustomerOrderHint,
  options?: { silent?: boolean }
): void {
  upsertActiveOrderHint(hint, options);
}

export function removeActiveOrderHint(orderId: string): void {
  const list = readActiveOrdersHint().filter((o) => o.id !== orderId);
  persistActiveOrdersHint(list);
}

/** @deprecated */
export function clearActiveTransitOrderHint(orderId?: string): void {
  if (!orderId) {
    forceClearActiveOrdersHint();
    return;
  }
  removeActiveOrderHint(orderId);
}

export function forceClearActiveOrdersHint(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WIRA_ACTIVE_ORDERS_KEY);
    localStorage.removeItem("wira_customer_active_transit_order");
    dispatchActiveOrderChanged();
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export function forceClearActiveTransitOrderHint(): void {
  forceClearActiveOrdersHint();
}

/** Sinkronkan hint dari data order terbaru — semua jenis layanan. */
export function syncActiveOrderFromOrder(order: ActiveCustomerOrderRecord): void {
  if (isCustomerActiveOrderStatus(order.order_status)) {
    upsertActiveOrderHint({
      id: order.id,
      order_status: order.order_status,
      delivery_address: order.delivery_address,
      service_type: order.service_type ?? null,
      driver_id: order.driver_id ?? null,
      merchant_name: order.merchant_name ?? null,
      updated_at: new Date().toISOString(),
    });
  } else {
    removeActiveOrderHint(order.id);
  }
}

/** @deprecated */
export function syncActiveTransitOrderFromOrder(order: ActiveCustomerOrderRecord): void {
  syncActiveOrderFromOrder(order);
}
