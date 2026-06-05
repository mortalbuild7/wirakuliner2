"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage, Negotiation } from "@/types/database";
import { formatIdr } from "@/lib/utils";

export function DriverNegotiation({
  orderId,
  driverId,
  userId,
}: {
  orderId: string;
  driverId: string;
  userId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [text, setText] = useState("");
  const [fee, setFee] = useState("25000");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const myNego = negotiations.find((n) => n.driver_id === driverId);

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
      .channel(`driver-nego-${orderId}`)
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
  }, [orderId, supabase]);

  async function sendMessage() {
    if (!text.trim()) return;
    await supabase.from("chat_messages").insert({
      order_id: orderId,
      sender_id: userId,
      message: text.trim(),
    });
    setText("");
  }

  async function proposeFee() {
    const amount = Number(fee);
    if (!Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    const res = await fetch("/api/driver/propose-fee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderId, proposedFee: amount }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal mengajukan ongkir");
    }
  }

  return (
    <div className="flex h-[360px] flex-col rounded-2xl border border-white/10 bg-slate-900/50">
      <div className="border-b border-white/10 p-3">
        <p className="text-xs text-muted-foreground">Ajukan ongkir (Rp)</p>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            className="rounded-xl border-white/10 bg-white/5"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            disabled={myNego?.status === "accepted"}
          />
          <Button
            size="sm"
            disabled={saving || myNego?.status === "accepted"}
            onClick={proposeFee}
          >
            Ajukan
          </Button>
        </div>
        {myNego && (
          <p className="mt-2 text-xs text-amber-200">
            Tarif Anda: {formatIdr(Number(myNego.proposed_fee))} — {myNego.status}
          </p>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.sender_id === userId ? "ml-auto bg-emerald-600 text-white" : "bg-muted"
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
          placeholder="Chat dengan customer..."
        />
        <Button onClick={sendMessage}>Kirim</Button>
      </div>
    </div>
  );
}
