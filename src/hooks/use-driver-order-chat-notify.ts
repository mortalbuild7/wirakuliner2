"use client";

import { useOrderChatUnread } from "@/hooks/use-order-chat-unread";
import { markDriverChatRead, markOrderChatRead } from "@/lib/order-chat-read";

export { markDriverChatRead, markOrderChatRead };

/** Notifikasi chat belum dibaca untuk driver. */
export function useDriverOrderChatNotify(
  orderId: string | null | undefined,
  driverUserId: string | null | undefined
) {
  return useOrderChatUnread(orderId, driverUserId, "driver", "Customer");
}
