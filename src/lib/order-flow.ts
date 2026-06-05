import type { OrderStatus } from "@/types/database";

export const DRIVER_REWARD_POINTS_PER_ORDER = 100;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Menunggu bayar",
  paid: "Dibayar — menunggu merchant",
  preparing: "Merchant memproses",
  ready_for_pickup: "Siap diambil driver",
  on_the_way: "Driver mengantar",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

/** Urutan alur pengantaran normal */
export const DELIVERY_FLOW: OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
  "delivered",
];
