"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import { flushDriverGpsToServer } from "@/lib/driver-gps-sync";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { useDriverMapLocation } from "@/hooks/use-driver-map-location";
import { DriverMapView } from "@/components/driver/driver-map-view";
import { DriverStatusToggle } from "@/components/driver/driver-status-toggle";
import { formatIdr } from "@/lib/utils";
import {
  driverGpsVehicleFromCategory,
  driverGpsVehicleFromOrder,
} from "@/lib/map-marker-icons";
import {
  driverOrderStatusLabel,
  channelLabel,
  getTransitKind,
  isOnsiteOrder,
  isTransitOrder,
  KULINER_FOOD_LABEL,
  parseTransitLegs,
} from "@/lib/order-channel";
import { DRIVER_REWARD_POINTS_PER_ORDER } from "@/lib/order-flow";
import {
  DriverChannelBadge,
  DriverOrderRouteLine,
  driverCardBorderClass,
  driverOrderCardClass,
  transitActiveStatusTextClass,
  transitCustomerBoxClass,
  transitCustomerRoleLabel,
  transitDestBoxClass,
  transitHeaderTextClass,
  transitNavActionClass,
  transitPassengerActionClass,
  transitPickupBoxClass,
  transitStatusBadgeClass,
} from "@/components/driver/driver-order-chrome";
import {
  OrderThankYouOverlayView,
  OrderTrackDeliveryLottie,
  useThankYouOverlay,
} from "@/components/customer/order-track-lottie";
import { DRIVER_STATUS_LABEL } from "@/lib/driver";
import type { DriverStatus, Order, OrderItem, ServiceType } from "@/types/database";
import {
  Award,
  Bike,
  Car,
  ChevronUp,
  Map,
  MapPin,
  Navigation,
  Package,
  Store,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriverHeaderControls } from "@/components/driver/driver-header-controls";
import { useDriverApkBottomPadding, useDriverApkWebView } from "@/components/driver/driver-apk-bottom-bar";
import {
  playDriverIncomingOrderSound,
  unlockDriverOrderAudio,
} from "@/lib/driver-order-alert";
import {
  DRIVER_INCOMING_ALERT_MESSAGE,
  isRelevantIncomingOrderForDriver,
  type DriverIncomingOrderRow,
} from "@/lib/driver-incoming-order";
import {
  isDriverApkWebView,
  notifyDriverApkIncomingOrder,
} from "@/lib/driver-apk-incoming-notify";
import { isOrderAlertAudioUnlocked } from "@/lib/order-alert-sound";
import { cn } from "@/lib/utils";
import { useDriverNavRoute } from "@/hooks/use-driver-nav-route";
import {
  hasReachedNavDestination,
  type DriverNavTarget,
} from "@/lib/driver-map-nav";
import { offerSecondsLeft } from "@/lib/driver-order-offer-utils";
import { WalletWithdrawPanel } from "@/components/wallet/wallet-withdraw-panel";
import { ReceivedReviewsPanel } from "@/components/ratings/received-reviews-panel";
import { DriverOrderChatButton } from "@/components/driver/driver-order-chat-button";
import { useDriverOrderChatNotify } from "@/hooks/use-driver-order-chat-notify";

type Tab = "map" | "profile";

type OrderRow = Order & {
  merchants?: { name: string; latitude: number; longitude: number; address: string | null };
  profiles?: { name: string; phone: string | null } | { name: string; phone: string | null }[];
  order_items?: OrderItem[];
};

function shortOrderId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatJoinDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const isApk = useDriverApkWebView();
  const apkWebBottomPad = useDriverApkBottomPadding();
  const [tab, setTab] = useState<Tab>("map");
  const [statusLoading, setStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<OrderRow | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [navMode, setNavMode] = useState<DriverNavTarget | null>(null);
  const [orderCardExpanded, setOrderCardExpanded] = useState(true);
  const [arrivedNotice, setArrivedNotice] = useState<string | null>(null);
  const [offerCountdown, setOfferCountdown] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const orderAlertsReadyRef = useRef(false);
  const lastAlertOrderIdRef = useRef<string | null>(null);
  const prevActiveStatusRef = useRef<string | null>(null);
  const {
    showThankYou,
    isFadingOut: thankYouFadingOut,
    title: thankYouTitle,
    subtitle: thankYouSubtitle,
    triggerThankYou,
  } = useThankYouOverlay();

  const isOnline = driver?.status === "idle" || driver?.status === "delivering";
  const hasActive = Boolean(activeOrder);

  const { unread: chatUnread } = useDriverOrderChatNotify(
    activeOrder?.id,
    userId
  );

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
    }, 800);
    return () => window.clearTimeout(timer);
  }, [driver?.id]);

  const signalIncomingOrder = useCallback(
    (order: OrderRow | DriverIncomingOrderRow) => {
      if (!order.id) return;
      if (lastAlertOrderIdRef.current === order.id) return;
      lastAlertOrderIdRef.current = order.id;

      if (isDriverApkWebView()) {
        notifyDriverApkIncomingOrder({
          id: order.id,
          delivery_address: order.delivery_address ?? "",
          delivery_fee: "delivery_fee" in order ? order.delivery_fee : undefined,
          service_type: (order.service_type ?? null) as ServiceType | null,
        });
        return;
      }

      window.alert(DRIVER_INCOMING_ALERT_MESSAGE);
      void playDriverIncomingOrderSound();
    },
    []
  );

  useEffect(() => {
    if (!incomingOffer?.id || hasActive || !isOnline) return;
    if (!orderAlertsReadyRef.current) return;
    signalIncomingOrder(incomingOffer);
  }, [incomingOffer?.id, hasActive, isOnline, signalIncomingOrder]);

  /** Ulangi suara peringatan selama penawaran masih aktif (browser saja — APK pakai notifikasi status bar). */
  useEffect(() => {
    if (isDriverApkWebView()) return;
    if (!incomingOffer?.id || hasActive || !isOnline || offerCountdown <= 0) return;
    if (!orderAlertsReadyRef.current) return;

    const timer = window.setInterval(() => {
      void playDriverIncomingOrderSound();
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [incomingOffer?.id, hasActive, isOnline, offerCountdown]);

  const loadPool = useCallback(async () => {
    if (!driver?.id) return;
    const res = await fetchWithDriverAuth("/api/driver/order-pool");
    if (!res.ok) {
      console.warn("[driver-order-pool]", res.status, await res.text().catch(() => ""));
      return;
    }
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

  const handleIncomingOrder = useCallback(
    (order: DriverIncomingOrderRow) => {
      if (!driver?.id || !isOnline || hasActive) return;
      if (!orderAlertsReadyRef.current) return;
      if (!isRelevantIncomingOrderForDriver(order, driver, isOnline)) return;
      signalIncomingOrder(order as OrderRow);
      void loadPool();
    },
    [driver, hasActive, isOnline, loadPool, signalIncomingOrder]
  );

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

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetchWithDriverAuth("/api/wallet/me");
      if (!res.ok) return;
      const json = (await res.json()) as { balance?: number };
      if (typeof json.balance === "number") setWalletBalance(json.balance);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!driver?.id) return;
    void loadPool();
    void loadStats();
    void loadWallet();

    const onOrderRow = (row: DriverIncomingOrderRow) => {
      if (row.offered_driver_id === driver.id || row.driver_id === driver.id) {
        handleIncomingOrder(row);
        if (row.driver_id === driver.id) void loadStats();
        return;
      }
      if (isOnline) {
        handleIncomingOrder(row);
      }
    };

    const ch = supabase
      .channel(`driver-cockpit-${driver.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as DriverIncomingOrderRow | undefined;
          if (row) onOrderRow(row);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as DriverIncomingOrderRow | undefined;
          if (row) onOrderRow(row);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadPool();
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [driver?.id, handleIncomingOrder, isOnline, loadPool, loadStats, supabase]);

  useEffect(() => {
    void loadPool();
  }, [loadPool, dismissed]);

  /** APK WebView sering miss realtime — poll agresif saat online. */
  useEffect(() => {
    if (!driver?.id || !isOnline) return;
    const ms = hasActive || incomingOffer ? 3000 : 1500;
    const timer = setInterval(() => {
      void loadPool();
    }, ms);
    return () => clearInterval(timer);
  }, [driver?.id, isOnline, hasActive, incomingOffer, loadPool]);

  useEffect(() => {
    if (!driver?.id || !isOnline) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadPool();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [driver?.id, isOnline, loadPool]);

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
  const activeAddr = activeOrder?.delivery_address ?? "";
  const activeIsTransit = activeOrder ? isTransitOrder(activeAddr) : false;
  const activeTransitKind = activeOrder ? getTransitKind(activeAddr) : null;
  const activeIsPaket = activeTransitKind === "paket";
  const activeIsPassenger = activeIsTransit && !activeIsPaket;
  const transitLegs = activeOrder ? parseTransitLegs(activeAddr) : null;

  const pickupCoords = useMemo(() => {
    if (!activeOrder || !activeIsTransit) return null;
    const lat = activeOrder.pickup_lat;
    const lng = activeOrder.pickup_lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  }, [activeOrder, activeIsTransit]);

  const navDestination = useMemo(() => {
    if (!navMode || !activeOrder) return null;
    if (navMode === "merchant") {
      if (activeIsTransit && pickupCoords) {
        return {
          lat: pickupCoords.lat,
          lng: pickupCoords.lng,
          label: activeIsPaket ? "Jemput paket" : "Jemput penumpang",
        };
      }
      if (shop?.latitude != null && shop?.longitude != null) {
        return { lat: shop.latitude, lng: shop.longitude, label: shop.name ?? "Toko" };
      }
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
        ? activeIsPaket
          ? "Sudah dekat pengirim — ambil paket"
          : activeIsPassenger
            ? "Sudah dekat titik jemput — temui penumpang"
            : "Sudah dekat restoran — ambil pesanan di toko"
        : activeIsPaket
          ? "Sudah dekat penerima — selesaikan pengiriman paket"
          : activeIsPassenger
            ? "Sudah dekat tujuan — selesaikan perjalanan"
            : "Sudah dekat lokasi customer — selesaikan pengantaran";

    setNavMode(null);
    setOrderCardExpanded(true);
    setArrivedNotice(message);
  }, [navMode, driverPos?.lat, driverPos?.lng, navDestination?.lat, navDestination?.lng]);

  const mapProps = useMemo(() => {
    const order = activeOrder ?? incomingOffer;
    const shop = order ? merchantOf(order) : undefined;
    const orderIsTransit = order ? isTransitOrder(order.delivery_address) : false;
    const orderPickup =
      orderIsTransit &&
      order?.pickup_lat != null &&
      order?.pickup_lng != null &&
      Number.isFinite(order.pickup_lat) &&
      Number.isFinite(order.pickup_lng)
        ? { lat: order.pickup_lat, lng: order.pickup_lng }
        : null;
    const live = mapGps.fix;
    const driverLat = live?.lat ?? driver?.current_lat;
    const driverLng = live?.lng ?? driver?.current_lng;
    const navigating = navMode != null;
    const driverVehicle = order
      ? driverGpsVehicleFromOrder(order)
      : driverGpsVehicleFromCategory(driver?.service_category);
    return {
      merchantLat: orderPickup?.lat ?? shop?.latitude,
      merchantLng: orderPickup?.lng ?? shop?.longitude,
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
      driverVehicle,
    };
  }, [
    activeOrder,
    incomingOffer,
    driver?.current_lat,
    driver?.current_lng,
    driver?.service_category,
    mapGps.fix,
    mapGps.zoomLocked,
    navMode,
    navRouteLine,
  ]);

  useEffect(() => {
    setAudioReady(isOrderAlertAudioUnlocked());
  }, [driver?.id]);

  async function setStatus(next: DriverStatus) {
    if (!driver) return;
    handleUserGesture();
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
    if (next === "idle" || next === "delivering") {
      await flushDriverGpsToServer();
    }
    await refresh();
  }

  function handleUserGesture() {
    void unlockDriverOrderAudio().then(() => setAudioReady(isOrderAlertAudioUnlocked()));
  }

  async function enableDriverAudio() {
    await unlockDriverOrderAudio();
    await playDriverIncomingOrderSound();
    setAudioReady(isOrderAlertAudioUnlocked());
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
    const kind = getTransitKind(activeOrder.delivery_address);
    const customerName = customerOf(activeOrder)?.name ?? "customer";
    const ok =
      kind === "paket"
        ? confirm(
            `Paket sudah diambil dari pengirim?\n\nMulai antar ke lokasi penerima.`
          )
        : kind
          ? confirm(
              `Penumpang ${customerName} sudah naik?\n\nMulai perjalanan ke lokasi tujuan.`
            )
          : confirm(
              `Konfirmasi pengambilan di toko:\n\nSebutkan ke kasir:\n• Nama: ${customerName}\n• ID: ${shortOrderId(activeOrder.id)}\n\nSudah menerima paket dari restoran?`
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
    triggerThankYou({
      title: "Order selesai!",
      subtitle: j.pointsAwarded
        ? `Terima kasih! +${j.pointsAwarded} poin reward`
        : "Terima kasih atas pengantarannya",
    });
    setActiveOrder(null);
    await refresh();
    await loadStats();
    await loadWallet();
    await loadPool();
    setTab("map");
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white text-slate-600">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
  const offerAddr = incomingOffer?.delivery_address ?? "";
  const offerIsTransit = incomingOffer ? isTransitOrder(offerAddr) : false;
  const offerTransitKind = incomingOffer ? getTransitKind(offerAddr) : null;
  const activeCustomer = activeOrder ? customerOf(activeOrder) : undefined;
  const orderTotal = (o: OrderRow) =>
    Number(o.total_product_amount) + Number(o.delivery_fee);

  const orderCardBottom = isApk
    ? apkWebBottomPad
      ? "bottom-[max(9rem,calc(5.75rem+max(env(safe-area-inset-bottom,0px),8px)))]"
      : "bottom-[max(1.75rem,env(safe-area-inset-bottom))]"
    : "bottom-[max(7rem,calc(0.75rem+env(safe-area-inset-bottom)))]";
  const deliveryLottieBottom = isApk
    ? apkWebBottomPad
      ? "bottom-[max(13rem,calc(9.5rem+max(env(safe-area-inset-bottom,0px),8px)))] pb-2"
      : "bottom-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] pb-2"
    : "bottom-[max(11rem,calc(10rem+env(safe-area-inset-bottom)))] pb-2";
  const orderItems = activeOrder?.order_items ?? [];

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      {!audioReady && (
        <div className="shrink-0 border-b border-amber-500/50 bg-amber-600/95 px-3 py-2.5 text-amber-50">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium sm:text-sm">
              Ketuk untuk aktifkan suara notifikasi order
            </p>
            <Button
              size="sm"
              className="shrink-0 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-50"
              onClick={() => void enableDriverAudio()}
            >
              Aktifkan suara
            </Button>
          </div>
        </div>
      )}
      <header className="shrink-0 border-b border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-500 shadow-md shadow-emerald-500/20">
              <Bike className="h-5 w-5 text-white" />
            </span>
            <div className="flex rounded-xl border border-slate-200/60 bg-slate-50 p-0.5">
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
                    "flex items-center gap-1 rounded-2xl px-2.5 py-1.5 text-[11px] font-medium transition",
                    tab === id
                      ? "bg-emerald-100 text-emerald-800 shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
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

          {activeOrder && hasActive && (
            <OrderTrackDeliveryLottie
              orderStatus={activeOrder.order_status}
              isDelivery={!isOnsiteOrder(activeOrder.delivery_address)}
              className={
                orderCardExpanded
                  ? "top-[max(5.5rem,calc(4.5rem+env(safe-area-inset-top,0px)))] pb-0"
                  : deliveryLottieBottom
              }
            />
          )}

          {navMode && navDestination && (
            <div
              className={cn(
                "absolute inset-x-4 top-3 z-10 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 text-center shadow-lg backdrop-blur",
                navMode === "merchant" ? "border-orange-300" : "border-sky-300"
              )}
            >
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  navMode === "merchant" ? "text-orange-700" : "text-sky-700"
                )}
              >
                Mode navigasi aktif
              </p>
              <p className="text-sm font-semibold text-slate-900">
                Garis biru menuju {navDestination.label}
              </p>
              <button
                type="button"
                onClick={stopNavMode}
                className="mt-2 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-700"
              >
                Hentikan navigasi
              </button>
            </div>
          )}

          {hasActive && activeOrder && (
            <div className="absolute right-4 top-3 z-20">
              <DriverOrderChatButton
                compact
                orderId={activeOrder.id}
                orderStatus={activeOrder.order_status}
                driverId={activeOrder.driver_id}
                unread={chatUnread}
              />
            </div>
          )}

          {arrivedNotice && !navMode && (
            <div className="pointer-events-none absolute inset-x-4 top-3 z-10 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-center shadow-lg">
              <p className="text-sm font-semibold text-emerald-900">{arrivedNotice}</p>
            </div>
          )}

          {!isOnline && !hasActive && (
            <div className="pointer-events-none absolute inset-x-4 top-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900">
              Tekan tombol ON di kanan atas untuk menerima pesanan
            </div>
          )}

          {incomingOffer && !hasActive && (
            <div
              data-driver-order-card
              className={cn(
                `absolute inset-x-4 ${orderCardBottom} z-20 rounded-2xl border-2 p-4`,
                driverOrderCardClass(offerAddr),
                driverCardBorderClass(offerAddr)
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      offerIsTransit
                        ? transitHeaderTextClass(offerTransitKind)
                        : "text-orange-700"
                    )}
                  >
                    Order masuk
                  </p>
                  <DriverChannelBadge deliveryAddress={offerAddr} />
                  <p className="text-lg font-bold text-slate-900">
                    {offerIsTransit ? channelLabel(offerAddr) : (offerShop?.name ?? KULINER_FOOD_LABEL)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    transitStatusBadgeClass(offerTransitKind, offerIsTransit)
                  )}
                >
                  {driverOrderStatusLabel(
                    incomingOffer.delivery_address,
                    incomingOffer.order_status
                  )}
                </span>
              </div>
              {offerCustomer && (
                <p className="mt-2 text-base font-bold text-slate-950">
                  {transitCustomerRoleLabel(offerTransitKind, offerIsTransit)}: {offerCustomer.name}
                </p>
              )}
              <div className="mt-2">
                <DriverOrderRouteLine
                  deliveryAddress={incomingOffer.delivery_address}
                  merchantName={offerIsTransit ? undefined : offerShop?.name}
                />
              </div>
              <p className="mt-3 text-xl font-bold text-slate-900">
                Tarif pendapatan {formatIdr(orderTotal(incomingOffer))}
                <span className="mt-1 block text-sm font-semibold text-slate-600">
                  {offerIsTransit ? "Tarif ride" : "Ongkir"}{" "}
                  {formatIdr(Number(incomingOffer.delivery_fee))}
                </span>
              </p>
              {offerCountdown > 0 && (
                <p className="mt-2 rounded-2xl bg-amber-100 px-3 py-2 text-center text-sm font-semibold text-amber-950">
                  Waktu terima:{" "}
                  <span className="font-mono font-bold">{offerCountdown} detik</span>
                  {" — "}
                  bila habis, order ke driver lain
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="h-14 min-h-[3.5rem] flex-1 rounded-full border-2 border-red-600 text-base font-bold text-red-700 hover:bg-red-50"
                  disabled={busy}
                  onClick={() => {
                    handleUserGesture();
                    rejectOffer();
                  }}
                >
                  Tolak
                </Button>
                <Button
                  className="driver-accept-order-btn"
                  disabled={busy}
                  onClick={acceptOffer}
                >
                  TERIMA ORDERAN
                </Button>
              </div>
            </div>
          )}

          {activeOrder && !orderCardExpanded && (
            <button
              type="button"
              data-driver-order-card
              onClick={() => {
                handleUserGesture();
                setOrderCardExpanded(true);
              }}
              className={cn(
                `absolute inset-x-4 ${orderCardBottom} z-20 flex w-auto items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3`,
                driverOrderCardClass(activeAddr),
                activeIsTransit ? driverCardBorderClass(activeAddr) : "border-orange-400"
              )}
            >
              <div className="min-w-0 text-left">
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    activeIsTransit
                      ? transitHeaderTextClass(activeTransitKind)
                      : "text-orange-700"
                  )}
                >
                  {navMode === "merchant"
                    ? activeIsTransit
                      ? "Navigasi jemput"
                      : "Navigasi ke toko"
                    : navMode === "customer"
                      ? activeIsTransit
                        ? "Navigasi tujuan"
                        : "Navigasi ke customer"
                      : activeIsTransit
                        ? channelLabel(activeAddr)
                        : KULINER_FOOD_LABEL}
                </p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {navDestination?.label ??
                    (activeIsTransit
                      ? activeCustomer?.name ?? "Penumpang"
                      : activeCustomer?.name ?? shop?.name ?? "Pesanan")}
                </p>
              </div>
              <ChevronUp className="h-5 w-5 shrink-0 text-slate-600" />
            </button>
          )}

          {activeOrder && orderCardExpanded && (
            <div
              data-driver-order-card
              className={cn(
                `absolute inset-x-4 ${orderCardBottom} z-20 max-h-[min(70dvh,520px)] overflow-y-auto rounded-2xl border-2 p-4`,
                driverOrderCardClass(activeAddr),
                driverCardBorderClass(activeAddr)
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      activeIsTransit
                        ? transitHeaderTextClass(activeTransitKind)
                        : "text-orange-700"
                    )}
                  >
                    {activeIsTransit ? "Ride aktif" : "Pesanan aktif"}
                  </p>
                  <DriverChannelBadge deliveryAddress={activeAddr} />
                  <p className="text-xs text-slate-600">
                    ID: <span className="font-mono font-semibold text-slate-800">{shortOrderId(activeOrder.id)}</span>
                  </p>
                </div>
                {navMode && (
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600"
                    onClick={() => setOrderCardExpanded(false)}
                  >
                    Minimize
                  </button>
                )}
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {activeIsTransit ? (
                  <>
                    <div className={transitPickupBoxClass(activeTransitKind)}>
                      <p className="driver-address-label flex items-center gap-1 text-emerald-900">
                        {activeIsPaket ? (
                          <Package className="h-3.5 w-3.5" />
                        ) : activeTransitKind === "ngomobil" ? (
                          <Car className="h-3.5 w-3.5" />
                        ) : (
                          <Bike className="h-3.5 w-3.5" />
                        )}
                        {activeIsPaket ? "Pengirim" : "Jemput"}
                      </p>
                      <p className="driver-address-value mt-1 line-clamp-3 text-slate-950">
                        {transitLegs?.pickup ?? (activeIsPaket ? "Lokasi pengirim" : "Titik jemput")}
                      </p>
                    </div>
                    <div className={transitDestBoxClass(activeTransitKind)}>
                      <p
                        className={cn(
                          "driver-address-label flex items-center gap-1",
                          activeTransitKind === "ngomobil" ? "text-sky-900" : "text-sky-900"
                        )}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {activeIsPaket ? "Penerima" : "Tujuan"}
                      </p>
                      <p className="driver-address-value mt-1 line-clamp-3 text-slate-950">
                        {transitLegs?.destination ??
                          (activeIsPaket ? "Lokasi penerima" : "Lokasi tujuan")}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-2">
                    <p className="driver-address-label flex items-center gap-1 text-orange-800">
                      <Store className="h-3 w-3" />
                      Restoran
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800">{shop?.name ?? "Toko"}</p>
                    {shop?.address && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{shop.address}</p>
                    )}
                  </div>
                )}
                {activeCustomer && (
                  <div className={transitCustomerBoxClass(activeTransitKind)}>
                    <p
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        activeTransitKind === "ngomobil" ? "text-sky-800" : "text-slate-700"
                      )}
                    >
                      {transitCustomerRoleLabel(activeTransitKind, activeIsTransit)}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-slate-950">{activeCustomer.name}</p>
                    {activeCustomer.phone && (
                      <p className="mt-1 text-xs font-medium text-slate-700">
                        HP: {activeCustomer.phone} · hubungi via chat in-app
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p
                className={cn(
                  "mt-2 text-xs font-semibold",
                  activeIsTransit
                    ? transitActiveStatusTextClass(activeTransitKind)
                    : "text-emerald-800"
                )}
              >
                {driverOrderStatusLabel(
                  activeOrder.delivery_address,
                  activeOrder.order_status
                )}
              </p>

              {!activeIsTransit && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                  {activeOrder.delivery_address}
                </p>
              )}

              {!activeIsTransit && orderItems.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  {orderItems.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2 text-slate-800">
                      <span>
                        {item.quantity}× {item.product_name}
                      </span>
                      <span className="text-slate-600">
                        {formatIdr(Number(item.price) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-2 text-xl font-bold text-slate-950">
                {formatIdr(orderTotal(activeOrder))}
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {activeIsTransit ? "tarif ride" : "total"}
                </span>
              </p>

              <DriverOrderChatButton
                className="mt-3"
                orderId={activeOrder.id}
                orderStatus={activeOrder.order_status}
                driverId={activeOrder.driver_id}
                unread={chatUnread}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {(activeIsTransit
                  ? pickupCoords != null
                  : shop?.latitude != null && shop.longitude != null) &&
                  ["paid", "preparing", "ready_for_pickup"].includes(
                    activeOrder.order_status
                  ) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 flex-1 rounded-xl font-semibold",
                        navMode === "merchant"
                          ? activeIsTransit
                            ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                            : "border-orange-400 bg-orange-50 text-orange-900"
                          : activeIsTransit
                            ? activeTransitKind === "ngomobil"
                              ? "border-sky-400 bg-sky-50 text-sky-950"
                              : "border-emerald-400 text-emerald-900"
                            : "border-orange-400 text-orange-900"
                      )}
                      onClick={() =>
                        navMode === "merchant" ? stopNavMode() : startNavMode("merchant")
                      }
                    >
                      <Navigation className="mr-1.5 h-3.5 w-3.5" />
                      {navMode === "merchant"
                        ? activeIsTransit
                          ? "Hentikan navigasi jemput"
                          : "Hentikan navigasi toko"
                        : activeIsTransit
                          ? "Navigasi jemput"
                          : "Navigasi ke toko"}
                    </Button>
                  )}
              </div>

              {!activeIsTransit && ["paid", "preparing"].includes(activeOrder.order_status) && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">
                  Tunggu merchant menandai pesanan siap diambil
                </p>
              )}

              {activeOrder.order_status === "ready_for_pickup" && activeIsPassenger && (
                <>
                  <div
                    className={cn(
                      "mt-3 rounded-xl border px-3 py-2",
                      activeTransitKind === "ngomobil"
                        ? "border-sky-300 bg-sky-50"
                        : "border-cyan-300 bg-cyan-50"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        activeTransitKind === "ngomobil" ? "text-sky-800" : "text-cyan-800"
                      )}
                    >
                      Temui penumpang di titik jemput
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {activeCustomer?.name ?? "Penumpang"}
                    </p>
                    {activeCustomer?.phone && (
                      <p className="mt-1 text-xs text-slate-600">
                        HP: {activeCustomer.phone}
                      </p>
                    )}
                  </div>
                  <Button
                    className={cn(
                      "mt-3 h-12 min-h-[3rem] w-full rounded-xl",
                      transitPassengerActionClass(activeTransitKind)
                    )}
                    disabled={busy}
                    onClick={() => {
                      handleUserGesture();
                      void pickupOrder();
                    }}
                  >
                    {activeTransitKind === "ngomobil" ? (
                      <Car className="mr-2 h-4 w-4" />
                    ) : (
                      <Bike className="mr-2 h-4 w-4" />
                    )}
                    Penumpang naik — mulai perjalanan
                  </Button>
                </>
              )}

              {activeOrder.order_status === "ready_for_pickup" && activeIsPaket && (
                <>
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                      Ambil paket di lokasi pengirim
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                      {transitLegs?.pickup ?? "Lokasi pengirim"}
                    </p>
                    {activeCustomer && (
                      <p className="mt-1 text-xs text-slate-600">
                        Customer: {activeCustomer.name}
                        {activeCustomer.phone ? ` · ${activeCustomer.phone}` : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    className="mt-3 h-12 min-h-[3rem] w-full rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 font-semibold text-slate-950"
                    disabled={busy}
                    onClick={() => {
                      handleUserGesture();
                      void pickupOrder();
                    }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Paket diambil — mulai antar
                  </Button>
                </>
              )}

              {activeOrder.order_status === "ready_for_pickup" && !activeIsTransit && (
                <>
                  <div className="mt-3 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-900">
                      Sebutkan ke kasir restoran
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      Nama: {activeCustomer?.name ?? "—"}
                    </p>
                    <p className="text-sm font-mono font-semibold text-orange-800">
                      ID: {shortOrderId(activeOrder.id)}
                    </p>
                  </div>
                  <Button
                    className="mt-3 h-12 min-h-[3rem] w-full rounded-xl bg-orange-500 font-semibold"
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
                      "mt-3 h-12 min-h-[3rem] w-full rounded-xl",
                      navMode === "customer"
                        ? "border border-sky-400 bg-sky-100 text-sky-950"
                        : transitNavActionClass(activeTransitKind)
                    )}
                    onClick={() =>
                      navMode === "customer" ? stopNavMode() : startNavMode("customer")
                    }
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {navMode === "customer"
                      ? activeIsTransit
                        ? "Hentikan navigasi tujuan"
                        : "Hentikan navigasi customer"
                      : activeIsTransit
                        ? "Navigasi ke tujuan"
                        : "Navigasi ke customer"}
                  </Button>
                  <Button
                    className="mt-2 h-12 min-h-[3rem] w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 font-semibold text-slate-950"
                    disabled={busy}
                    onClick={() => {
                      handleUserGesture();
                      void completeOrder();
                    }}
                  >
                    {activeIsPaket
                      ? `Selesai kirim paket (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`
                      : activeIsPassenger
                        ? `Selesai ${channelLabel(activeAddr)} (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`
                        : `Selesai antar (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <section className="glass-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Profil driver
            </p>
            <div className="mt-2 flex items-center gap-3">
              {driver.photo_url ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={driver.photo_url}
                    alt={driver.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                  <User className="h-7 w-7 text-slate-500" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold text-slate-900">{driver.name}</h1>
                <p className="truncate text-sm font-medium text-slate-600">{driver.phone}</p>
              </div>
            </div>
            {driver.vehicle_plate && (
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                {driver.vehicle_plate}
              </p>
            )}
            <div className="mt-3 space-y-1.5 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-xs text-slate-600">
                Status:{" "}
                <strong className="font-bold text-emerald-800">
                  {DRIVER_STATUS_LABEL[driver.status]}
                </strong>
              </p>
              <p className="text-xs text-slate-600">
                Bergabung:{" "}
                <strong className="font-bold text-slate-900">
                  {formatJoinDate(driver.created_at)}
                </strong>
              </p>
              {(driver.rating_count ?? 0) > 0 && (
                <p className="text-xs text-slate-600">
                  Rating:{" "}
                  <strong className="font-bold text-amber-800">
                    {Number(driver.rating_avg ?? 0).toFixed(1)} ★ ({driver.rating_count})
                  </strong>
                </p>
              )}
            </div>
          </section>

          <section className="wira-wallet-card flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-6 w-6 shrink-0 text-white" />
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">Saldo</p>
            </div>
            <p className="wira-wallet-balance shrink-0 tabular-nums">
              {walletBalance == null ? "—" : formatIdr(walletBalance)}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 text-center">
              <Package className="mx-auto h-5 w-5 text-emerald-600" />
              <p className="mt-2 text-2xl font-bold text-slate-900">{todayCount}</p>
              <p className="text-[10px] font-medium text-slate-600">Selesai hari ini</p>
            </div>
            <div className="glass-card p-4 text-center">
              <Award className="mx-auto h-5 w-5 text-cyan-600" />
              <p className="mt-2 text-2xl font-bold text-slate-900">{driver.reward_points ?? 0}</p>
              <p className="text-[10px] font-medium text-slate-600">Poin reward</p>
            </div>
          </section>

          <WalletWithdrawPanel
            balance={walletBalance}
            onBalanceChange={setWalletBalance}
            driverMode
          />

          <ReceivedReviewsPanel driverMode />

          <section className="glass-card min-w-0 space-y-3 overflow-hidden p-4">
            <p className="text-sm font-bold text-slate-800">Ketersediaan</p>
            <p className="text-[11px] leading-snug text-slate-500">
              Pilih status agar sistem tahu kapan Anda bisa menerima order baru.
            </p>
            <DriverStatusToggle
              status={driver.status}
              onChange={setStatus}
              loading={statusLoading}
              lockDelivering={hasActive}
            />
          </section>
        </main>
      )}

      <OrderThankYouOverlayView
        open={showThankYou}
        isFadingOut={thankYouFadingOut}
        title={thankYouTitle}
        subtitle={thankYouSubtitle}
      />
    </div>
  );
}
