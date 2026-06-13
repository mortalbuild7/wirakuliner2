"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isOrderChatClosed, isOrderChatOpen } from "@/lib/order-chat";
import { markDriverChatRead } from "@/lib/order-chat-read";
import type { OrderStatus } from "@/types/database";
import { cn } from "@/lib/utils";

type Props = {
  orderId: string;
  orderStatus: OrderStatus | string;
  driverId: string | null;
  unread?: number;
  className?: string;
  compact?: boolean;
};

export function DriverOrderChatButton({
  orderId,
  orderStatus,
  driverId,
  unread = 0,
  className,
  compact = false,
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
      : "Chat customer"
    : "Riwayat chat";

  function handleClick() {
    markDriverChatRead(orderId);
  }

  if (compact) {
    return (
      <Link
        href={`/driver/orders/${orderId}/chat`}
        onClick={handleClick}
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-800 shadow-lg",
          unread > 0 && "border-red-400 text-red-700",
          className
        )}
        aria-label={label}
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link href={`/driver/orders/${orderId}/chat`} className={cn("block", className)} onClick={handleClick}>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-11 w-full rounded-xl border-sky-300 bg-sky-50 font-semibold text-sky-900 hover:bg-sky-100",
          unread > 0 && "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
        )}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        {label}
        {unread > 0 && (
          <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </Button>
    </Link>
  );
}
