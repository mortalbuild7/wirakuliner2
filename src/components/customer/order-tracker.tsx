"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, Truck, Utensils } from "lucide-react";
import type { Order, OrderStatus } from "@/types/database";

const STEPS: { status: OrderStatus; label: string; icon: React.ReactNode }[] = [
  { status: "pending_payment", label: "Menunggu Bayar", icon: <Package className="h-4 w-4" /> },
  { status: "paid", label: "Dibayar", icon: <Package className="h-4 w-4" /> },
  { status: "preparing", label: "Disiapkan", icon: <Utensils className="h-4 w-4" /> },
  { status: "on_the_way", label: "Dalam Perjalanan", icon: <Truck className="h-4 w-4" /> },
  { status: "delivered", label: "Sampai", icon: <MapPin className="h-4 w-4" /> },
];

export function OrderTracker({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, drivers(current_lat, current_lng)")
        .eq("id", orderId)
        .single();
      if (data) {
        setOrder(data as Order);
        const d = data.drivers as { current_lat: number; current_lng: number } | null;
        if (d?.current_lat) setDriverPos({ lat: d.current_lat, lng: d.current_lng });
      }
    };
    load();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (!order) return <p className="text-muted-foreground">Memuat pelacakan...</p>;

  const currentIdx = STEPS.findIndex((s) => s.status === order.order_status);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <div
            key={step.status}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              i <= currentIdx ? "border-primary bg-accent" : "opacity-50"
            }`}
          >
            {step.icon}
            <span className="font-medium">{step.label}</span>
            {i === currentIdx && <Badge className="ml-auto">Aktif</Badge>}
          </div>
        ))}
      </div>
      {driverPos && order.order_status === "on_the_way" && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium">Lokasi driver (realtime)</p>
          <p className="font-mono text-xs text-muted-foreground">
            {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)}
          </p>
        </div>
      )}
    </div>
  );
}
