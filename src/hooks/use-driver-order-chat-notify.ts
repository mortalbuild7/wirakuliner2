"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { orderChatChannelName } from "@/lib/order-chat";

function lastReadKey(orderId: string) {
  return `wira_chat_read_${orderId}`;
}

/** Timestamp pesan terakhir yang sudah dibaca driver. */
export function markDriverChatRead(orderId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(lastReadKey(orderId), String(Date.now()));
}

/**
 * Notifikasi chat in-app untuk driver — subscribe INSERT order_chats per order aktif.
 */
export function useDriverOrderChatNotify(
  orderId: string | null | undefined,
  driverUserId: string | null | undefined
) {
  const [unread, setUnread] = useState(0);

  const clearUnread = useCallback(() => {
    if (orderId) markDriverChatRead(orderId);
    setUnread(0);
  }, [orderId]);

  useEffect(() => {
    if (!orderId || !driverUserId) {
      setUnread(0);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    async function countUnread() {
      const lastReadRaw = sessionStorage.getItem(lastReadKey(orderId!));
      const lastRead = lastReadRaw ? new Date(Number(lastReadRaw)).toISOString() : null;

      let query = supabase
        .from("order_chats")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId!)
        .neq("sender_id", driverUserId!);

      if (lastRead) {
        query = query.gt("created_at", lastRead);
      }

      const { count } = await query;
      if (!cancelled) setUnread(count ?? 0);
    }

    void countUnread();

    const channel = supabase
      .channel(`${orderChatChannelName(orderId)}:driver-notify`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_chats",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          if (row.sender_id && row.sender_id !== driverUserId) {
            setUnread((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId, driverUserId]);

  return { unread, clearUnread };
}
