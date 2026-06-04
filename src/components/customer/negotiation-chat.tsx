"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage, Negotiation } from "@/types/database";
import { formatIdr } from "@/lib/utils";

export function NegotiationChat({
  orderId,
  userId,
}: {
  orderId: string;
  userId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [text, setText] = useState("");
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at")
      .then(({ data }) => setMessages(data ?? []));

    supabase
      .from("negotiations")
      .select("*")
      .eq("order_id", orderId)
      .then(({ data }) => setNegotiations(data ?? []));

    const ch = supabase
      .channel(`nego-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `order_id=eq.${orderId}` },
        (p) => setMessages((m) => [...m, p.new as ChatMessage])
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "negotiations", filter: `order_id=eq.${orderId}` },
        () => {
          supabase.from("negotiations").select("*").eq("order_id", orderId).then(({ data }) => setNegotiations(data ?? []));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  async function sendMessage() {
    if (!text.trim()) return;
    await supabase.from("chat_messages").insert({
      order_id: orderId,
      sender_id: userId,
      message: text.trim(),
    });
    setText("");
  }

  async function acceptFee(negotiationId: string, fee: number) {
    await supabase
      .from("negotiations")
      .update({ status: "accepted" })
      .eq("id", negotiationId);
    await supabase
      .from("orders")
      .update({
        delivery_fee: fee,
        negotiation_status: "agreed",
        order_status: "pending_payment",
      })
      .eq("id", orderId);
  }

  return (
    <div className="flex h-[400px] flex-col rounded-2xl border border-white/10 bg-slate-900/50">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {negotiations.map((n) => (
          <div key={n.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Driver mengajukan ongkir: <strong>{formatIdr(Number(n.proposed_fee))}</strong>
            {n.status === "pending" && (
              <Button size="sm" className="mt-2" onClick={() => acceptFee(n.id, Number(n.proposed_fee))}>
                Setuju & Lanjut Bayar
              </Button>
            )}
          </div>
        ))}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {m.message}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-white/10 p-3">
        <Input
          className="rounded-xl border-white/10 bg-white/5"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ketik pesan nego..."
        />
        <Button onClick={sendMessage}>Kirim</Button>
      </div>
    </div>
  );
}
