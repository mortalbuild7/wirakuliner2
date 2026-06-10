"use client";

/**
 * Entry chat universal — deteksi peran login lalu render panel yang sama.
 * Route group (client) tidak mengubah URL: /orders/{id}/chat
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OrderChatPanel } from "@/components/chat/order-chat-panel";
import { createClient } from "@/lib/supabase/client";
import { isNgojekOrder } from "@/lib/order-channel";
import { Button } from "@/components/ui/button";
import type { Order, OrderStatus } from "@/types/database";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function OrderChatPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [peerLabel, setPeerLabel] = useState("Lawan bicara");
  const [backHref, setBackHref] = useState("/customer/orders");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function boot() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace(`/login?redirect=/orders/${orderId}/chat`);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const { data: o, error } = await supabase
        .from("orders")
        .select("id, customer_id, driver_id, order_status, delivery_address")
        .eq("id", orderId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !o) {
        setLoading(false);
        return;
      }

      const row = o as Order;
      const isCustomer = row.customer_id === user.id;
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();

      const isDriver = driver?.id != null && row.driver_id === driver.id;

      if (!isCustomer && !isDriver) {
        router.replace("/unauthorized");
        return;
      }

      const ride = isNgojekOrder(row.delivery_address);

      if (isCustomer) {
        setPeerLabel(ride ? "Driver" : "Driver");
        setBackHref(`/customer/orders/${orderId}`);
      } else {
        setPeerLabel(ride ? "Penumpang" : "Customer");
        setBackHref(`/driver/orders/${orderId}`);
      }

      if (profile?.role === "driver") {
        setBackHref(`/driver/orders/${orderId}`);
      }

      setUserId(user.id);
      setOrder(row);
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

  if (!userId || !order) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 text-center text-sm text-muted-foreground">
        Pesanan tidak ditemukan atau Anda bukan partisipan chat.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-bold text-white">Chat Perjalanan</h1>
      </div>

      <OrderChatPanel
        orderId={orderId}
        userId={userId}
        orderStatus={order.order_status as OrderStatus}
        driverId={order.driver_id}
        peerLabel={peerLabel}
      />
    </main>
  );
}
