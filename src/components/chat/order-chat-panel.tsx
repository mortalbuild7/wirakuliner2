"use client";

/**
 * Panel chat real-time per order_id (stateless).
 *
 * Alur:
 * 1. Muat riwayat via SELECT (RLS membatasi ke partisipan order)
 * 2. Subscribe `postgres_changes` INSERT pada `order_chats` filter order_id
 * 3. Kirim pesan via Server Action (validasi + sanitasi server-side)
 * 4. Cleanup `removeChannel` saat unmount — cegah memory leak / CPU leak
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage } from "@/app/actions/chatActions";
import { createClient } from "@/lib/supabase/client";
import {
  isOrderChatClosed,
  isOrderChatOpen,
  orderChatChannelName,
} from "@/lib/order-chat";
import type { OrderChatRow, OrderStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, Send } from "lucide-react";

type Props = {
  orderId: string;
  userId: string;
  orderStatus: OrderStatus | string;
  driverId: string | null;
  /** Label lawan bicara di bubble (mis. "Driver" / "Customer") */
  peerLabel?: string;
};

export function OrderChatPanel({
  orderId,
  userId,
  orderStatus,
  driverId,
  peerLabel = "Lawan bicara",
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<OrderChatRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(orderStatus);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatOpen = isOrderChatOpen({
    driver_id: driverId,
    order_status: liveStatus,
  });
  const chatClosed = isOrderChatClosed({ order_status: liveStatus });

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    setLiveStatus(orderStatus);
  }, [orderStatus]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("order_chats")
        .select("id, order_id, sender_id, message, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (loadError) {
        setError("Gagal memuat riwayat chat");
      } else {
        setMessages((data ?? []) as OrderChatRow[]);
        setError(null);
      }
      setLoading(false);
    }

    void loadHistory();

    const channel = supabase
      .channel(orderChatChannelName(orderId))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_chats",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as OrderChatRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as { order_status?: OrderStatus };
          if (row.order_status) setLiveStatus(row.order_status);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId, supabase]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending || !chatOpen) return;

    setSending(true);
    setError(null);

    const result = await sendChatMessage(orderId, trimmed);

    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setText("");
  }

  const endedBanner = chatClosed ? (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      Sesi chat telah berakhir karena pesanan telah selesai.
    </div>
  ) : !driverId ? (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
      Chat akan aktif setelah driver ditugaskan pada pesanan ini.
    </div>
  ) : !chatOpen && !chatClosed ? (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
      Chat belum aktif untuk status pesanan saat ini.
    </div>
  ) : null;

  return (
    <div className="flex min-h-[70vh] flex-col rounded-xl border border-white/10 bg-[#0d1117]">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <MessageCircle className="h-5 w-5 text-cyan-400" />
        <div>
          <p className="text-sm font-semibold text-white">Chat Pesanan</p>
          <p className="text-[10px] text-muted-foreground">
            Room unik per transaksi · ID {orderId.slice(0, 8)}…
          </p>
        </div>
      </header>

      <div className="space-y-2 border-b border-white/10 px-3 py-2">{endedBanner}</div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pesan...
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Belum ada pesan. Mulai percakapan dengan {peerLabel.toLowerCase()}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-br-md bg-cyan-600/90 text-white"
                      : "rounded-bl-md bg-white/10 text-white"
                  }`}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-medium text-cyan-200/90">
                      {peerLabel}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p
                    className={`mt-1 text-[10px] ${mine ? "text-cyan-100/70" : "text-muted-foreground"}`}
                  >
                    {new Date(m.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-3 pb-1 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            chatOpen ? "Ketik pesan..." : "Chat tidak tersedia"
          }
          disabled={!chatOpen || sending}
          maxLength={1000}
          className="flex-1 border-white/15 bg-white/5"
          aria-label="Pesan chat"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!chatOpen || sending || !text.trim()}
          className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
          aria-label="Kirim pesan"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
