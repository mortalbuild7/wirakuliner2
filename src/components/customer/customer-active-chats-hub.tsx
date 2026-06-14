"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCustomerOrdersMonitor } from "@/contexts/customer-orders-monitor-context";
import { isOrderChatOpen } from "@/lib/order-chat";
import { decodeStoredChatEntities } from "@/lib/privacy/chat-sanitize";

type ChatPreview = {
  orderId: string;
  channelLabel: string;
  preview: string;
  unread: number;
};

/**
 * Semua chat driver aktif — dibaca sekaligus di halaman pesanan.
 */
export function CustomerActiveChatsHub() {
  const { activeOrders, chatUnreadByOrder, totalChatUnread } = useCustomerOrdersMonitor();
  const [previews, setPreviews] = useState<ChatPreview[]>([]);

  const chatOrders = useMemo(
    () => activeOrders.filter((o) => isOrderChatOpen(o)),
    [activeOrders]
  );

  useEffect(() => {
    if (chatOrders.length === 0) {
      setPreviews([]);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const rows: ChatPreview[] = [];
      for (const order of chatOrders) {
        const { data } = await supabase
          .from("order_chats")
          .select("message")
          .eq("order_id", order.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        rows.push({
          orderId: order.id,
          channelLabel: order.channel_label,
          preview: data?.message
            ? decodeStoredChatEntities(data.message).slice(0, 80)
            : "Belum ada pesan",
          unread: chatUnreadByOrder[order.id] ?? 0,
        });
      }
      if (!cancelled) setPreviews(rows);
    })();

    const channels = chatOrders.map((order) =>
      supabase
        .channel(`chat-hub-preview:${order.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "order_chats",
            filter: `order_id=eq.${order.id}`,
          },
          (payload) => {
            const msg = (payload.new as { message?: string }).message ?? "";
            setPreviews((prev) =>
              prev.map((p) =>
                p.orderId === order.id
                  ? {
                      ...p,
                      preview: decodeStoredChatEntities(msg).slice(0, 80) || p.preview,
                      unread: chatUnreadByOrder[order.id] ?? p.unread,
                    }
                  : p
              )
            );
          }
        )
        .subscribe()
    );

    return () => {
      cancelled = true;
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [chatOrders, chatUnreadByOrder]);

  if (chatOrders.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Chat driver aktif</h2>
        {totalChatUnread > 0 ? (
          <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {totalChatUnread} belum dibaca
          </span>
        ) : null}
      </div>
      <ul className="space-y-2">
        {previews.map((row) => (
          <li key={row.orderId}>
            <Link
              href={`/customer/orders/${row.orderId}/chat`}
              className="flex items-center gap-3 rounded-xl border border-sky-100 bg-white p-3 transition active:scale-[0.99] hover:border-sky-300"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{row.channelLabel}</p>
                <p className="line-clamp-1 text-xs text-slate-500">{row.preview}</p>
              </div>
              {row.unread > 0 ? (
                <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  {row.unread}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
