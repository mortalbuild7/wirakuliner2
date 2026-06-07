"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import { isOnsiteOrder } from "@/lib/order-channel";
import { CustomerOrderTrackMap } from "@/components/customer/customer-order-track-map";
import Image from "next/image";
import { Loader2, MapPin, Package, Phone, Search, Truck, User, Utensils } from "lucide-react";
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

  const driverId = order?.driver_id ?? null;
  const trackDriverLive =
    Boolean(driverId) &&
    order != null &&
    !isOnsiteOrder(order.delivery_address) &&
    !["pending_payment", "cancelled", "delivered"].includes(order.order_status);

  useEffect(() => {
    if (!trackDriverLive || !driverId) return;

    let cancelled = false;

    const applyDriverPos = (lat: number | null, lng: number | null) => {
      if (cancelled || lat == null || lng == null) return;
      setDriverPos({ lat, lng });
    };

    const pollDriver = async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as TrackResponse;
      if (res.ok && json.driverPos) {
        applyDriverPos(json.driverPos.lat, json.driverPos.lng);
      }
      if (res.ok && json.driverInfo) {
        setDriverInfo(json.driverInfo);
      }
    };

    const driverChannel = supabase
      .channel(`track-driver-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload) => {
          const row = payload.new as { current_lat?: number | null; current_lng?: number | null };
          applyDriverPos(row.current_lat ?? null, row.current_lng ?? null);
        }
      )
      .subscribe();

    void pollDriver();
    const timer = setInterval(() => {
      void pollDriver();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(driverChannel);
    };
  }, [driverId, orderId, supabase, trackDriverLive]);

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

  const isDelivery = !isOnsiteOrder(order.delivery_address);
  const searchingDriver =
    isDelivery &&
    !order.driver_id &&
    ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);

  const currentIdx = STEPS.findIndex((s) => s.status === order.order_status);
  const statusLabel = searchingDriver
    ? "Mencari driver..."
    : ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;

  const showDriverMap =
    isDelivery &&
    Boolean(order.driver_id) &&
    order.delivery_lat != null &&
    order.delivery_lng != null &&
    !["pending_payment", "cancelled"].includes(order.order_status);

  return (
    <div className="space-y-6">
      {searchingDriver && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
              <Search className="h-5 w-5 animate-pulse text-amber-300" />
            </span>
            <div>
              <p className="font-medium text-amber-100">Mencari driver</p>
              <p className="mt-0.5 text-xs text-amber-200/80">
                Pesanan sudah masuk ke sistem. Driver terdekat akan segera menerima penawaran.
              </p>
            </div>
            <Loader2 className="ml-auto h-5 w-5 animate-spin text-amber-300" />
          </div>
        </div>
      )}

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
      {showDriverMap && (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <p className="border-b border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white">
            Posisi driver
          </p>
          <CustomerOrderTrackMap
            deliveryLat={order.delivery_lat}
            deliveryLng={order.delivery_lng}
            driverLat={driverPos?.lat}
            driverLng={driverPos?.lng}
          />
          {!driverPos && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Menunggu lokasi GPS driver...
            </p>
          )}
        </div>
      )}

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
          {driverPos && ["on_the_way", "ready_for_pickup", "preparing", "paid"].includes(order.order_status) && (
            <p className="mt-3 text-xs text-muted-foreground">
              {order.order_status === "on_the_way"
                ? "Lokasi driver diperbarui — sedang menuju Anda"
                : "Driver sudah ditugaskan — pantau posisi di peta di atas"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
