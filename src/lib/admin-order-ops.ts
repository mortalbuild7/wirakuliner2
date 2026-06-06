import { isOnsiteOrder } from "@/lib/order-channel";
import { isStoreOpen } from "@/lib/merchant-open";
import { DELIVERY_FLOW, ORDER_STATUS_LABEL } from "@/lib/order-flow";
import type { Order, OrderStatus } from "@/types/database";

export type OrderOpsIssue =
  | "no_driver"
  | "merchant_closed"
  | "merchant_inactive"
  | "stuck_ready_pickup"
  | "stuck_paid"
  | "driver_not_pickup";

export const ORDER_OPS_ISSUE_LABEL: Record<OrderOpsIssue, string> = {
  no_driver: "Belum ada driver",
  merchant_closed: "Toko tutup / libur",
  merchant_inactive: "Toko nonaktif / ditangguhkan",
  stuck_ready_pickup: "Siap diambil — driver lama tidak ambil",
  stuck_paid: "Terbayar — merchant lama tidak proses",
  driver_not_pickup: "Driver sudah ditugaskan — belum ambil di toko",
};

const ACTIVE_STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
];

const NO_DRIVER_MINUTES = 12;
const STUCK_READY_MINUTES = 18;
const STUCK_PAID_MINUTES = 25;
const DRIVER_NOT_PICKUP_MINUTES = 3;

export function minutesSince(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
}

export function orderTotalAmount(order: Pick<Order, "total_product_amount" | "delivery_fee">) {
  return Number(order.total_product_amount) + Number(order.delivery_fee);
}

export function isOrderCancellable(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function detectOrderIssues(
  order: Order,
  merchant?: MerchantJoin | null
): OrderOpsIssue[] {
  if (order.order_status === "cancelled" || order.order_status === "delivered") {
    return [];
  }

  const issues: OrderOpsIssue[] = [];
  const ageMin = minutesSince(order.created_at);
  const delivery = !isOnsiteOrder(order.delivery_address);

  if (merchant) {
    if (!merchant.is_active || merchant.admin_suspended) {
      issues.push("merchant_inactive");
    } else if (!isStoreOpen(merchant)) {
      issues.push("merchant_closed");
    }
  }

  if (
    delivery &&
    !order.driver_id &&
    ["paid", "preparing", "ready_for_pickup"].includes(order.order_status)
  ) {
    if (order.order_status === "ready_for_pickup" && ageMin >= STUCK_READY_MINUTES) {
      issues.push("stuck_ready_pickup");
    } else if (ageMin >= NO_DRIVER_MINUTES) {
      issues.push("no_driver");
    }
  }

  if (order.order_status === "paid" && ageMin >= STUCK_PAID_MINUTES) {
    issues.push("stuck_paid");
  }

  if (
    delivery &&
    order.driver_id &&
    order.order_status === "ready_for_pickup"
  ) {
    const readySince =
      (order as Order & { updated_at?: string }).updated_at ?? order.created_at;
    if (minutesSince(readySince) >= DRIVER_NOT_PICKUP_MINUTES) {
      issues.push("driver_not_pickup");
    }
  }

  return [...new Set(issues)];
}

export function orderFlowSteps(current: OrderStatus) {
  const terminal = current === "cancelled";
  const doneIdx = terminal
    ? DELIVERY_FLOW.length
    : DELIVERY_FLOW.findIndex((s) => s === current);

  return DELIVERY_FLOW.map((status, i) => ({
    status,
    label: ORDER_STATUS_LABEL[status],
    done: !terminal && i <= doneIdx,
    active: !terminal && i === doneIdx,
  }));
}

type MerchantJoin = {
  name: string;
  is_open?: boolean;
  is_active?: boolean;
  admin_suspended?: boolean;
};

export type AdminOrderOpsRow = Omit<Order, "merchants"> & {
  merchants?: MerchantJoin;
  profiles?: { name: string; email: string | null };
  drivers?: { name: string } | null;
  issues: OrderOpsIssue[];
  ageMinutes: number;
  total: number;
};

function pickOne<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function enrichOrderForOps(
  order: Order & {
    merchants?: MerchantJoin | MerchantJoin[];
    profiles?: { name: string; email: string | null } | { name: string; email: string | null }[];
    drivers?: { name: string } | { name: string }[] | null;
  }
): AdminOrderOpsRow {
  const m = pickOne(order.merchants);
  return {
    ...order,
    merchants: m,
    profiles: pickOne(order.profiles),
    drivers: pickOne(order.drivers) ?? null,
    issues: detectOrderIssues(order, m ?? null),
    ageMinutes: Math.round(minutesSince(order.created_at)),
    total: orderTotalAmount(order),
  };
}
