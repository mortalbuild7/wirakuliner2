import type { OrderStatus } from "@/types/database";

/**
 * Status order saat chat customer ↔ driver boleh aktif.
 * Setara PICKING_UP / DELIVERING pada spesifikasi bisnis.
 */
/** Chat aktif sejak driver ditugaskan hingga selesai perjalanan. */
export const ORDER_CHAT_OPEN_STATUSES: OrderStatus[] = [
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
];

export const ORDER_CHAT_CLOSED_STATUSES: OrderStatus[] = [
  "delivered",
  "cancelled",
];

export function isOrderChatOpen(order: {
  driver_id: string | null;
  order_status: OrderStatus | string;
}): boolean {
  return (
    order.driver_id != null &&
    ORDER_CHAT_OPEN_STATUSES.includes(order.order_status as OrderStatus)
  );
}

export function isOrderChatClosed(order: {
  order_status: OrderStatus | string;
}): boolean {
  return ORDER_CHAT_CLOSED_STATUSES.includes(order.order_status as OrderStatus);
}

/** Room chat unik per transaksi — filter realtime selalu by order_id. */
export function orderChatChannelName(orderId: string): string {
  return `room:${orderId}`;
}
