"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import Image from "next/image";
import { MapPin, Package, Phone, Truck, User, Utensils } from "lucide-react";
import type { DriverPublicInfo, Order, OrderStatus } from "@/types/database";

const STEPS: { status: OrderStatus; label: string; icon: React.ReactNode }[] = [
  { status: "pending_payment", label: "Menunggu Bayar", icon: <Package className="h-4 w-4" /> },
  { status: "paid", label: "Dibayar", icon: <Package className="h-4 w-4" /> },
  { status: "preparing", label: "Merchant Memproses", icon: <Utensils className="h-4 w-4" /> },
  { status: "ready_for_pickup", label: "Siap Diambil Driver", icon: <Package className="h-4 w-4" /> },
  { status: "on_the_way", label: "Driver Mengantar", icon: <Truck className="h-4 w-4" /> },
  { status: "delivered", label: "Sampai", icon: <MapPin className="h-4 w-4" /> },
];

type TrackResponse = {
  order?: Order;
  driverPos?: { lat: number; lng: number } | null;
  driverInfo?: DriverPublicInfo | null;
  error?: string;
};

export function OrderTracker({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverPublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const applyOrder = useCallback(
    (
      next: Order,
      pos?: { lat: number; lng: number } | null,
      driver?: DriverPublicInfo | null
    ) => {
      setOrder(next);
      setDriverPos(pos ?? null);
      setDriverInfo(driver ?? null);
      setError(null);
      setLoading(false);
    },
    []
  );

  const loadOrder = useCallback(async () => {
    try {
      const cached = sessionStorage.getItem(`wira_track_${orderId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as Order;
        if (parsed?.id === orderId) applyOrder(parsed);
      }
    } catch {
      /* ignore */
    }

    const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as TrackResponse;

    if (res.status === 401) {
      setError("Silakan login untuk melacak pesanan");
      setLoading(false);
      return false;
    }

    if (res.ok && json.order) {
      applyOrder(json.order, json.driverPos, json.driverInfo);
      try {
        sessionStorage.setItem(`wira_track_${orderId}`, JSON.stringify(json.order));
      } catch {
        /* ignore */
      }
      return true;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (data) {
        applyOrder(data as Order);
        return true;
      }
    }

    setError(json.error ?? "Pesanan tidak ditemukan");
    setLoading(false);
    return false;
  }, [applyOrder, orderId, supabase]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const run = async (attempt = 0) => {
      if (cancelled) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (attempt < 8) {
          retryTimer = setTimeout(() => void run(attempt + 1), 400);
        } else {
          setError("Sesi login belum siap. Muat ulang halaman.");
          setLoading(false);
        }
        return;
      }

      const ok = await loadOrder();
      if (!ok && attempt < 4 && !cancelled) {
        retryTimer = setTimeout(() => void run(attempt + 1), 600);
      }
    };

    void run();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !cancelled) void loadOrder();
    });

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => {
          if (!cancelled) void loadOrder();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [orderId, loadOrder, supabase]);

  if (loading) {
    return <p className="text-muted-foreground">Memuat pelacakan...</p>;
  }

  if (error || !order) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        {error ?? "Pesanan tidak ditemukan"}
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.status === order.order_status);
  const statusLabel = ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
        <p className="text-muted-foreground">Status saat ini</p>
        <p className="mt-1 font-medium text-white">{statusLabel}</p>
      </div>

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
      {driverInfo && order.driver_id && !["pending_payment", "cancelled"].includes(order.order_status) && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-200">Driver Anda</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/20 bg-muted">
              {driverInfo.photo_url ? (
                <Image
                  src={driverInfo.photo_url}
                  alt={driverInfo.name}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <User className="h-6 w-6" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{driverInfo.name}</p>
              {driverInfo.vehicle_plate && (
                <p className="text-xs text-muted-foreground">{driverInfo.vehicle_plate}</p>
              )}
              <a
                href={`tel:${driverInfo.phone}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
              >
                <Phone className="h-3 w-3" />
                {driverInfo.phone}
              </a>
            </div>
          </div>
          {driverPos && order.order_status === "on_the_way" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Lokasi driver diperbarui — sedang menuju Anda
            </p>
          )}
        </div>
      )}
    </div>
  );
}
