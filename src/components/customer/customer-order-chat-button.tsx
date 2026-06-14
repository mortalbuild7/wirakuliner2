"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { isOrderChatClosed, isOrderChatOpen } from "@/lib/order-chat";
import { markCustomerChatRead } from "@/hooks/use-customer-order-chat-notify";
import type { OrderStatus } from "@/types/database";
import { cn } from "@/lib/utils";

type Props = {
  orderId: string;
  orderStatus: OrderStatus | string;
  driverId: string | null;
  unread?: number;
  className?: string;
  isRide?: boolean;
};

export function CustomerOrderChatButton({
  orderId,
  orderStatus,
  driverId,
  unread = 0,
  className,
  isRide = false,
}: Props) {
  const order = { driver_id: driverId, order_status: orderStatus };
  const chatOpen = isOrderChatOpen(order);
  const chatClosed = isOrderChatClosed(order);

  if (!driverId || (!chatOpen && !chatClosed)) {
    return null;
  }

  const label = chatOpen
    ? unread > 0
      ? `Chat (${unread} baru)`
      : isRide
        ? "Chat dengan driver"
        : "Chat dengan driver"
    : "Lihat riwayat chat";

  function handleClick() {
    markCustomerChatRead(orderId);
  }

  return (
    <Link
      href={`/customer/orders/${orderId}/chat`}
      className={cn("block", className)}
      onClick={handleClick}
    >
      <span
        className={cn(
          "relative flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition",
          unread > 0
            ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
            : "border-cyan-300 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
        )}
      >
        <MessageCircle className="h-4 w-4" />
        {label}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </Link>
  );
}
