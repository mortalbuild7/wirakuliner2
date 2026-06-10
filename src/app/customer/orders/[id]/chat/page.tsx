"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OrderChatPanel } from "@/components/chat/order-chat-panel";
import { createClient } from "@/lib/supabase/client";
import { isNgojekOrder } from "@/lib/order-channel";
import { Button } from "@/components/ui/button";
import type { Order, OrderStatus } from "@/types/database";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function CustomerOrderChatPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function boot() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace(`/login?redirect=/customer/orders/${orderId}/chat`);
        return;
      }

      const { data: o, error } = await supabase
        .from("orders")
        .select("id, customer_id, driver_id, order_status, delivery_address")
        .eq("id", orderId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !o || o.customer_id !== user.id) {
        router.replace("/unauthorized");
        return;
      }

      setUserId(user.id);
      setOrder(o as Order);
      setLoading(false);
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [orderId, router, supabase]);

  if (loading) {
    return (
      <main className="mx-auto flex max-w-lg items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Memuat chat...
      </main>
    );
  }

  if (!userId || !order) return null;

  const ride = isNgojekOrder(order.delivery_address);

  return (
    <main className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Link href={`/customer/orders/${orderId}`}>
          <Button variant="ghost" size="icon" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-bold text-white">
          {ride ? "Chat dengan Driver" : "Chat Driver"}
        </h1>
      </div>

      <OrderChatPanel
        orderId={orderId}
        userId={userId}
        orderStatus={order.order_status as OrderStatus}
        driverId={order.driver_id}
        peerLabel="Driver"
      />
    </main>
  );
}
