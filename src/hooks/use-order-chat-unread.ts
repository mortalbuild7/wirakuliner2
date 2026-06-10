"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { orderChatChannelName } from "@/lib/order-chat";
import {
  getOrderChatLastReadIso,
  markOrderChatRead,
  type OrderChatReaderRole,
} from "@/lib/order-chat-read";
import { notifyIncomingChatMessage } from "@/lib/order-chat-notify";
import { decodeStoredChatEntities } from "@/lib/privacy/chat-sanitize";

/**
 * Hitung & pantau pesan chat belum dibaca per order — customer atau driver.
 * Realtime INSERT + badge; suara/notifikasi browser jika tidak di halaman chat.
 */
export function useOrderChatUnread(
  orderId: string | null | undefined,
  myUserId: string | null | undefined,
  role: OrderChatReaderRole,
  peerLabel: string
) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const onChatPage =
    Boolean(orderId && pathname?.includes(`/orders/${orderId}/chat`));

  const clearUnread = useCallback(() => {
    if (orderId) markOrderChatRead(orderId, role);
    setUnread(0);
  }, [orderId, role]);

  useEffect(() => {
    if (!orderId || !myUserId) {
      setUnread(0);
      return;
    }

    if (onChatPage) {
      markOrderChatRead(orderId, role);
      setUnread(0);
    }

    let cancelled = false;
    const supabase = createClient();

    async function countUnread() {
      const lastRead = getOrderChatLastReadIso(orderId!, role);

      let query = supabase
        .from("order_chats")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId!)
        .neq("sender_id", myUserId!);

      if (lastRead) {
        query = query.gt("created_at", lastRead);
      }

      const { count } = await query;
      if (!cancelled && !onChatPage) setUnread(count ?? 0);
    }

    void countUnread();

    const channel = supabase
      .channel(`${orderChatChannelName(orderId)}:${role}-notify`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_chats",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as { sender_id?: string; message?: string };
          if (!row.sender_id || row.sender_id === myUserId) return;

          if (onChatPage) {
            markOrderChatRead(orderId!, role);
            setUnread(0);
            return;
          }

          setUnread((n) => n + 1);
          const preview = decodeStoredChatEntities(row.message ?? "");
          void notifyIncomingChatMessage({
            orderId: orderId!,
            peerLabel,
            preview,
            onChatPage: false,
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId, myUserId, role, peerLabel, onChatPage]);

  return { unread, clearUnread };
}
