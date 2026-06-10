"use client";

import { useOrderChatUnread } from "@/hooks/use-order-chat-unread";
import { markOrderChatRead } from "@/lib/order-chat-read";

export function markCustomerChatRead(orderId: string): void {
  markOrderChatRead(orderId, "customer");
}

/** Notifikasi chat belum dibaca untuk customer. */
export function useCustomerOrderChatNotify(
  orderId: string | null | undefined,
  customerUserId: string | null | undefined
) {
  return useOrderChatUnread(orderId, customerUserId, "customer", "Driver");
}
