"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { useDriverMapLocation } from "@/hooks/use-driver-map-location";
import { DriverMapView } from "@/components/driver/driver-map-view";
import { DriverStatusToggle } from "@/components/driver/driver-status-toggle";
import { formatIdr } from "@/lib/utils";
import { isOnsiteOrder } from "@/lib/order-channel";
import {
  DRIVER_REWARD_POINTS_PER_ORDER,
  ORDER_STATUS_LABEL,
} from "@/lib/order-flow";
import { DRIVER_STATUS_LABEL } from "@/lib/driver";
import type { DriverStatus, Order, OrderItem } from "@/types/database";
import {
  Award,
  Bike,
  ChevronUp,
  Map,
  MapPin,
  Navigation,
  Package,
  Phone,
  Store,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriverHeaderControls } from "@/components/driver/driver-header-controls";
import {
  playDriverIncomingOrderSound,
  unlockDriverOrderAudio,
} from "@/lib/driver-order-alert";
import { cn } from "@/lib/utils";
import { useDriverNavRoute } from "@/hooks/use-driver-nav-route";
import {
  hasReachedNavDestination,
  type DriverNavTarget,
} from "@/lib/driver-map-nav";
import { offerSecondsLeft } from "@/lib/driver-order-offer";

type Tab = "map" | "profile";

type OrderRow = Order & {
  merchants?: { name: string; latitude: number; longitude: number; address: string | null };
  profiles?: { name: string; phone: string | null } | { name: string; phone: string | null }[];
  order_items?: OrderItem[];
};

function shortOrderId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function pickOne<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function merchantOf(order: OrderRow) {
  return pickOne(order.merchants);
}

function customerOf(order: OrderRow) {
  return pickOne(order.profiles);
}

function dismissedKey(driverId: string) {
  return `wira_driver_dismissed_${driverId}`;
}

function loadDismissed(driverId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(dismissedKey(driverId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(driverId: string, ids: Set<string>) {
  sessionStorage.setItem(dismissedKey(driverId), JSON.stringify([...ids]));
}

export function DriverCockpit() {
  const { driver, userId, loading, refresh } = useDriverProfile();
  const [tab, setTab] = useState<Tab>("map");
  const [statusLoading, setStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<OrderRow | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [navMode, setNavMode] = useState<DriverNavTarget | null>(null);
  const [orderCardExpanded, setOrderCardExpanded] = useState(true);
  const [arrivedNotice, setArrivedNotice] = useState<string | null>(null);
  const [offerCountdown, setOfferCountdown] = useState(0);
  const router = useRouter();
  const supabase = createClient();
  const orderAlertsReadyRef = useRef(false);
  const lastAlertOrderIdRef = useRef<string | null>(null);
  const prevActiveStatusRef = useRef<string | null>(null);

  const isOnline = driver?.status === "idle" || driver?.status === "delivering";
  const hasActive = Boolean(activeOrder);

  const mapGps = useDriverMapLocation(Boolean(driver && tab === "map"));

  useDriverLocation(
    driver?.id,
    driver?.status,
    Boolean(driver && (hasActive || isOnline))
  );

  useEffect(() => {
    if (!driver?.id) return;
    setDismissed(loadDismissed(driver.id));
    orderAlertsReadyRef.current = false;
    lastAlertOrderIdRef.current = null;
    const timer = window.setTimeout(() => {
      orderAlertsReadyRef.current = true;
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [driver?.id]);

  useEffect(() => {
    if (!incomingOffer?.id || hasActive || !isOnline) return;
    if (!orderAlertsReadyRef.current) return;
    if (lastAlertOrderIdRef.current === incomingOffer.id) return;
    lastAlertOrderIdRef.current = incomingOffer.id;
    void playDriverIncomingOrderSound();
  }, [incomingOffer?.id, hasActive, isOnline]);

  const loadPool = useCallback(async () => {
    if (!driver?.id) return;
    const res = await fetchWithDriverAuth("/api/driver/order-pool");
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as {
      activeOrder?: OrderRow | null;
      incoming?: OrderRow[];
    };
    setActiveOrder(json.activeOrder ?? null);
    if (json.activeOrder) {
      setIncomingOffer(null);
      return;
    }
    const pool = (json.incoming ?? []).filter((o) => !isOnsiteOrder(o.delivery_address));
    setIncomingOffer(pool[0] ?? null);
    if (pool[0]?.offered_at) {
      setOfferCountdown(offerSecondsLeft(pool[0].offered_at));
    } else {
      setOfferCountdown(0);
    }
  }, [driver?.id, dismissed]);

  const loadStats = useCallback(async () => {
    if (!driver?.id) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .eq("order_status", "delivered")
      .gte("created_at", start.toISOString());
    setTodayCount(count ?? 0);
  }, [driver?.id, supabase]);

  useEffect(() => {
    if (!driver?.id) return;
    void loadPool();
    void loadStats();

    const ch = supabase
      .channel(`driver-cockpit-${driver.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadPool();
        void loadStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [driver?.id, loadPool, loadStats, supabase]);

  useEffect(() => {
    void loadPool();
  }, [loadPool, dismissed]);

  /** APK WebView sering miss realtime — poll status order aktif tiap 5 detik. */
  useEffect(() => {
    if (!driver?.id || !hasActive) return;
    const timer = setInterval(() => {
      void loadPool();
    }, 5000);
    return () => clearInterval(timer);
  }, [driver?.id, hasActive, loadPool]);

  useEffect(() => {
    const status = activeOrder?.order_status ?? null;
    if (!status) {
      prevActiveStatusRef.current = null;
      return;
    }
    const prev = prevActiveStatusRef.current;
    if (prev && prev !== status && status === "ready_for_pickup") {
      void playDriverIncomingOrderSound();
    }
    prevActiveStatusRef.current = status;
  }, [activeOrder?.id, activeOrder?.order_status]);

  useEffect(() => {
    setNavMode(null);
    setOrderCardExpanded(true);
    setArrivedNotice(null);
  }, [activeOrder?.id, activeOrder?.order_status]);

  useEffect(() => {
    if (navMode) setOrderCardExpanded(false);
  }, [navMode]);

  useEffect(() => {
    if (!driver?.id || !isOnline || hasActive) return;
    const timer = setInterval(() => {
      void loadPool();
    }, incomingOffer ? 3000 : 12_000);
    return () => clearInterval(timer);
  }, [driver?.id, hasActive, isOnline, loadPool, incomingOffer?.id]);

  useEffect(() => {
    if (!incomingOffer?.offered_at || hasActive) return;
    const tick = () => setOfferCountdown(offerSecondsLeft(incomingOffer.offered_at));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [incomingOffer?.id, incomingOffer?.offered_at, hasActive]);

  const shop = activeOrder ? merchantOf(activeOrder) : undefined;

  const navDestination = useMemo(() => {
    if (!navMode || !activeOrder) return null;
    if (navMode === "merchant" && shop?.latitude != null && shop?.longitude != null) {
      return { lat: shop.latitude, lng: shop.longitude, label: shop.name ?? "Toko" };
    }
    if (
      navMode === "customer" &&
      activeOrder.delivery_lat != null &&
      activeOrder.delivery_lng != null
    ) {
      return {
        lat: activeOrder.delivery_lat,
        lng: activeOrder.delivery_lng,
        label: customerOf(activeOrder)?.name ?? "Customer",
      };
    }
    return null;
  }, [navMode, activeOrder, shop]);

  const driverPos =
    mapGps.fix?.lat != null && mapGps.fix?.lng != null
      ? { lat: mapGps.fix.lat, lng: mapGps.fix.lng }
      : driver?.current_lat != null && driver?.current_lng != null
        ? { lat: driver.current_lat, lng: driver.current_lng }
        : null;

  const navRouteLine = useDriverNavRoute(
    navDestination != null,
    driverPos,
    navDestination ? { lat: navDestination.lat, lng: navDestination.lng } : null
  );

  useEffect(() => {
    if (!navMode || !driverPos || !navDestination) return;
    if (!hasReachedNavDestination(driverPos, navDestination)) return;

    const message =
      navMode === "merchant"
        ? "Sudah dekat restoran — ambil pesanan di toko"
        : "Sudah dekat lokasi customer — selesaikan pengantaran";

    setNavMode(null);
    setOrderCardExpanded(true);
    setArrivedNotice(message);
  }, [navMode, driverPos?.lat, driverPos?.lng, navDestination?.lat, navDestination?.lng]);

  const mapProps = useMemo(() => {
    const order = activeOrder ?? incomingOffer;
    const shop = order ? merchantOf(order) : undefined;
    const live = mapGps.fix;
    const driverLat = live?.lat ?? driver?.current_lat;
    const driverLng = live?.lng ?? driver?.current_lng;
    const navigating = navMode != null;
    return {
      merchantLat: shop?.latitude,
      merchantLng: shop?.longitude,
      deliveryLat: order?.delivery_lat,
      deliveryLng: order?.delivery_lng,
      driverLat,
      driverLng,
      driverAccuracyM: live?.accuracy ?? null,
      followDriver: navigating || (!order && live != null),
      lockDriverZoom: navigating || (!order && mapGps.zoomLocked),
      navigationMode: navigating,
      navigationTarget: navigating ? navMode : null,
      navigationRouteLine: navigating ? navRouteLine ?? undefined : undefined,
    };
  }, [
    activeOrder,
    incomingOffer,
    driver?.current_lat,
    driver?.current_lng,
    mapGps.fix,
    mapGps.zoomLocked,
    navMode,
    navRouteLine,
  ]);

  async function setStatus(next: DriverStatus) {
    if (!driver) return;
    setStatusLoading(true);
    const res = await fetchWithDriverAuth("/api/driver/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatusLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal ubah status");
      return;
    }
    await refresh();
  }

  function handleUserGesture() {
    void unlockDriverOrderAudio();
  }

  function startNavMode(target: DriverNavTarget) {
    handleUserGesture();
    setNavMode(target);
    setOrderCardExpanded(false);
    setArrivedNotice(null);
  }

  function stopNavMode() {
    setNavMode(null);
    setOrderCardExpanded(true);
    setArrivedNotice(null);
  }

  async function acceptOffer() {
    handleUserGesture();
    if (!incomingOffer || !driver) return;
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/accept-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: incomingOffer.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal terima pesanan");
      return;
    }
    setIncomingOffer(null);
    await loadPool();
    await refresh();
    setTab("map");
  }

  async function rejectOffer() {
    if (!incomingOffer || !driver) return;

    const res = await fetchWithDriverAuth("/api/driver/decline-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: incomingOffer.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? "Gagal menolak penawaran");
      return;
    }
    lastAlertOrderIdRef.current = null;
    setIncomingOffer(null);
    void loadPool();
  }

  async function pickupOrder() {
    if (!activeOrder) return;
    const customerName = customerOf(activeOrder)?.name ?? "customer";
    const orderCode = shortOrderId(activeOrder.id);
    const ok = confirm(
      `Konfirmasi pengambilan di toko:\n\nSebutkan ke kasir:\n• Nama: ${customerName}\n• ID: ${orderCode}\n\nSudah menerima paket dari restoran?`
    );
    if (!ok) return;
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: activeOrder.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal ambil pesanan");
      return;
    }
    await loadPool();
  }

  async function completeOrder() {
    if (!activeOrder) return;
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: activeOrder.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal menyelesaikan");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (j.pointsAwarded) {
      alert(`Pesanan selesai! +${j.pointsAwarded} poin reward`);
    }
    setActiveOrder(null);
    await refresh();
    await loadStats();
    await loadPool();
    setTab("map");
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p className="text-sm">Memuat profil driver...</p>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <p className="text-sm">Profil driver belum siap.</p>
        <Button className="rounded-xl" onClick={() => router.replace("/driver/setup")}>
          Lengkapi profil
        </Button>
      </div>
    );
  }

  const offerShop = incomingOffer ? merchantOf(incomingOffer) : undefined;
  const offerCustomer = incomingOffer ? customerOf(incomingOffer) : undefined;
  const activeCustomer = activeOrder ? customerOf(activeOrder) : undefined;
  const orderTotal = (o: OrderRow) =>
    Number(o.total_product_amount) + Number(o.delivery_fee);

  const orderCardBottom =
    "bottom-[max(7rem,calc(0.75rem+env(safe-area-inset-bottom)))]";
  const orderItems = activeOrder?.order_items ?? [];

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 glass-panel">
        <div className="flex items-center justify-between gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600">
              <Bike className="h-4 w-4 text-slate-950" />
            </span>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
              {(
                [
                  { id: "map" as Tab, label: "Peta", icon: Map },
                  { id: "profile" as Tab, label: "Profil", icon: User },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                    tab === id
                      ? "bg-emerald-500/25 text-emerald-200"
                      : "text-muted-foreground hover:text-white"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", tab === id && "text-emerald-400")} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <DriverHeaderControls />
        </div>
      </header>

      {tab === "map" ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DriverMapView {...mapProps} className="absolute inset-0 h-full w-full" />

          {navMode && navDestination && (
            <div
              className={cn(
                "absolute inset-x-4 top-3 z-10 rounded-2xl border px-4 py-2.5 text-center shadow-lg",
                navMode === "merchant"
                  ? "border-orange-400/60 bg-orange-950/92"
                  : "border-sky-400/60 bg-sky-950/92"
              )}
            >
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  navMode === "merchant" ? "text-orange-300" : "text-sky-300"
                )}
              >
                Mode navigasi aktif
              </p>
              <p className="text-sm font-medium text-white">
                Garis biru menuju {navDestination.label}
              </p>
              <button
                type="button"
                onClick={stopNavMode}
                className="mt-2 rounded-lg border border-white/20 px-3 py-1 text-[10px] text-white/90"
              >
                Hentikan navigasi
              </button>
            </div>
          )}

          {arrivedNotice && !navMode && (
            <div className="pointer-events-none absolute inset-x-4 top-3 z-10 rounded-2xl border border-emerald-400/50 bg-emerald-950/90 px-4 py-2.5 text-center shadow-lg">
              <p className="text-sm font-medium text-emerald-100">{arrivedNotice}</p>
            </div>
          )}

          {!isOnline && !hasActive && (
            <div className="pointer-events-none absolute inset-x-4 top-3 rounded-2xl border border-amber-500/40 bg-amber-950/80 px-4 py-2.5 text-center text-xs text-amber-100">
              Tekan tombol ON di kanan atas untuk menerima pesanan
            </div>
          )}

          {incomingOffer && !hasActive && (
            <div
              className={`absolute inset-x-4 ${orderCardBottom} z-20 rounded-2xl border border-emerald-500/40 bg-slate-950/95 p-4 shadow-xl backdrop-blur`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Pesanan masuk
              </p>
              <p className="mt-1 text-lg font-bold text-white">
                {offerShop?.name ?? "Toko"}
              </p>
              {offerCustomer && (
                <p className="mt-1 text-sm font-medium text-cyan-200">
                  Customer: {offerCustomer.name}
                  {offerCustomer.phone ? ` · ${offerCustomer.phone}` : ""}
                </p>
              )}
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {incomingOffer.delivery_address}
              </p>
              <p className="mt-2 text-sm font-semibold text-cyan-300">
                {formatIdr(orderTotal(incomingOffer))}
                <span className="ml-2 text-xs text-muted-foreground">
                  ongkir {formatIdr(Number(incomingOffer.delivery_fee))}
                </span>
              </p>
              {offerCountdown > 0 && (
                <p className="mt-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-100">
                  Waktu terima:{" "}
                  <span className="font-mono font-bold text-amber-300">{offerCountdown} detik</span>
                  {" — "}
                  bila habis, order ke driver lain
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border-red-500/40 text-red-300"
                  disabled={busy}
                  onClick={() => {
                    handleUserGesture();
                    rejectOffer();
                  }}
                >
                  Tolak
                </Button>
                <Button
                  className="h-11 flex-1 rounded-xl bg-emerald-600 font-semibold"
                  disabled={busy}
                  onClick={acceptOffer}
                >
                  Terima
                </Button>
              </div>
            </div>
          )}

          {activeOrder && !orderCardExpanded && (
            <button
              type="button"
              onClick={() => {
                handleUserGesture();
                setOrderCardExpanded(true);
              }}
              className={`absolute inset-x-4 ${orderCardBottom} z-20 flex w-auto items-center justify-between gap-3 rounded-2xl border border-sky-400/50 bg-slate-950/95 px-4 py-3 shadow-xl backdrop-blur`}
            >
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                  {navMode === "merchant"
                    ? "Navigasi ke toko"
                    : navMode === "customer"
                      ? "Navigasi ke customer"
                      : "Pesanan aktif"}
                </p>
                <p className="truncate text-sm font-semibold text-white">
                  {navDestination?.label ?? activeCustomer?.name ?? shop?.name ?? "Pesanan"}
                </p>
              </div>
              <ChevronUp className="h-5 w-5 shrink-0 text-sky-300" />
            </button>
          )}

          {activeOrder && orderCardExpanded && (
            <div
              className={`absolute inset-x-4 ${orderCardBottom} z-20 max-h-[min(70dvh,520px)] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-xl backdrop-blur`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                    Pesanan aktif
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ID: <span className="font-mono text-cyan-200">{shortOrderId(activeOrder.id)}</span>
                  </p>
                </div>
                {navMode && (
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-muted-foreground"
                    onClick={() => setOrderCardExpanded(false)}
                  >
                    Minimize
                  </button>
                )}
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                    <Store className="h-3 w-3" />
                    Restoran
                  </p>
                  <p className="mt-0.5 font-medium text-white">{shop?.name ?? "Toko"}</p>
                  {shop?.address && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{shop.address}</p>
                  )}
                </div>
                {activeCustomer && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90">
                      Customer
                    </p>
                    <p className="mt-0.5 font-medium text-white">{activeCustomer.name}</p>
                    {activeCustomer.phone && (
                      <a
                        href={`tel:${activeCustomer.phone}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {activeCustomer.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-emerald-200/90">
                {ORDER_STATUS_LABEL[activeOrder.order_status]}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {activeOrder.delivery_address}
              </p>

              {orderItems.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
                  {orderItems.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2 text-white/90">
                      <span>
                        {item.quantity}× {item.product_name}
                      </span>
                      <span className="text-muted-foreground">{formatIdr(Number(item.price) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-2 font-semibold text-cyan-300">
                {formatIdr(orderTotal(activeOrder))}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {shop?.latitude != null &&
                  shop.longitude != null &&
                  ["paid", "preparing", "ready_for_pickup"].includes(
                    activeOrder.order_status
                  ) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 flex-1 rounded-xl",
                        navMode === "merchant"
                          ? "border-orange-400/60 bg-orange-950/40 text-orange-100"
                          : "border-orange-500/40 text-orange-200"
                      )}
                      onClick={() =>
                        navMode === "merchant" ? stopNavMode() : startNavMode("merchant")
                      }
                    >
                      <Navigation className="mr-1.5 h-3.5 w-3.5" />
                      {navMode === "merchant" ? "Hentikan navigasi toko" : "Navigasi ke toko"}
                    </Button>
                  )}
              </div>

              {["paid", "preparing"].includes(activeOrder.order_status) && (
                <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-100">
                  Tunggu merchant menandai pesanan siap diambil
                </p>
              )}

              {activeOrder.order_status === "ready_for_pickup" && (
                <>
                  <div className="mt-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-200">
                      Sebutkan ke kasir restoran
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      Nama: {activeCustomer?.name ?? "—"}
                    </p>
                    <p className="text-sm font-mono text-orange-100">
                      ID: {shortOrderId(activeOrder.id)}
                    </p>
                  </div>
                  <Button
                    className="mt-3 h-11 w-full rounded-xl bg-orange-500 font-semibold"
                    disabled={busy}
                    onClick={() => {
                      handleUserGesture();
                      void pickupOrder();
                    }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Sudah sebutkan — ambil pesanan
                  </Button>
                </>
              )}

              {activeOrder.order_status === "on_the_way" && (
                <>
                  <Button
                    type="button"
                    className={cn(
                      "mt-3 h-11 w-full rounded-xl font-semibold",
                      navMode === "customer"
                        ? "border border-sky-400/50 bg-sky-950 text-sky-100"
                        : "bg-gradient-to-r from-sky-500 to-cyan-500 text-slate-950"
                    )}
                    onClick={() =>
                      navMode === "customer" ? stopNavMode() : startNavMode("customer")
                    }
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {navMode === "customer"
                      ? "Hentikan navigasi customer"
                      : "Navigasi ke customer"}
                  </Button>
                  <Button
                    className="mt-2 h-11 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 font-semibold text-slate-950"
                    disabled={busy}
                    onClick={() => {
                      handleUserGesture();
                      void completeOrder();
                    }}
                  >
                    Selesai antar (+{DRIVER_REWARD_POINTS_PER_ORDER} poin)
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <section className="glass-card p-4">
            <p className="text-sm text-muted-foreground">Profil driver</p>
            <div className="mt-2 flex items-center gap-3">
              {driver.photo_url ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={driver.photo_url}
                    alt={driver.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                  <User className="h-7 w-7 text-muted-foreground" />
                </span>
              )}
              <div>
                <h1 className="text-xl font-bold text-white">{driver.name}</h1>
                <p className="text-xs text-muted-foreground">{driver.phone}</p>
              </div>
            </div>
            {driver.vehicle_plate && (
              <p className="text-xs text-emerald-300/80">{driver.vehicle_plate}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Status:{" "}
              <strong className="text-white">{DRIVER_STATUS_LABEL[driver.status]}</strong>
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 text-center">
              <Package className="mx-auto h-5 w-5 text-emerald-400" />
              <p className="mt-2 text-2xl font-bold text-white">{todayCount}</p>
              <p className="text-[10px] text-muted-foreground">Selesai hari ini</p>
            </div>
            <div className="glass-card p-4 text-center">
              <Award className="mx-auto h-5 w-5 text-amber-400" />
              <p className="mt-2 text-2xl font-bold text-white">{driver.reward_points ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Poin reward</p>
            </div>
          </section>

          <section className="glass-card space-y-3 p-4">
            <p className="text-sm font-medium text-white">Ketersediaan</p>
            <DriverStatusToggle
              status={driver.status}
              onChange={setStatus}
              loading={statusLoading}
              lockDelivering={hasActive}
            />
          </section>
        </main>
      )}
    </div>
  );
}
