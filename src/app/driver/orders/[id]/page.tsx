"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { DriverRouteMap } from "@/components/driver/driver-route-map";
import { Button } from "@/components/ui/button";
import { cn, formatIdr } from "@/lib/utils";
import { DRIVER_REWARD_POINTS_PER_ORDER } from "@/lib/order-flow";
import {
  channelLabel,
  driverOrderStatusLabel,
  getTransitKind,
  isTransitOrder,
  KULINER_FOOD_LABEL,
  parseTransitLegs,
} from "@/lib/order-channel";
import type { Order, OrderItem } from "@/types/database";
import { pickOrderCustomer } from "@/lib/order-customer";
import {
  DriverChannelBadge,
  DriverOrderRouteLine,
  driverCardBorderClass,
} from "@/components/driver/driver-order-chrome";
import {
  Bike,
  CheckCircle,
  MapPin,
  Package,
  Store,
  User,
} from "lucide-react";
import { isOrderChatClosed, isOrderChatOpen } from "@/lib/order-chat";
import { DriverOrderChatButton } from "@/components/driver/driver-order-chat-button";
import { useDriverOrderChatNotify } from "@/hooks/use-driver-order-chat-notify";

export default function DriverOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { driver, userId, loading: profileLoading } = useDriverProfile();
  const [order, setOrder] = useState<
    | (Order & {
        profiles?: { name: string; phone: string | null } | { name: string; phone: string | null }[];
        order_items?: OrderItem[];
      })
    | null
  >(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useDriverLocation(
    driver?.id,
    driver?.status,
    Boolean(driver && order?.order_status === "on_the_way")
  );

  useEffect(() => {
    if (!profileLoading && !driver) router.replace("/driver/setup");
  }, [profileLoading, driver, router]);

  useEffect(() => {
    if (!orderId) return;

    async function load() {
      const res = await fetchWithDriverAuth(`/api/driver/orders/${orderId}`);
      if (res.ok) {
        const json = (await res.json()) as {
          order?: Order & {
            profiles?: { name: string; phone: string | null }[];
            order_items?: OrderItem[];
          };
        };
        const o = json.order ?? null;
        setOrder(o);
        setItems(o?.order_items ?? []);
        return;
      }

      const { data: o } = await supabase
        .from("orders")
        .select("*, merchants(name, latitude, longitude, address)")
        .eq("id", orderId)
        .single();
      setOrder((o as Order) ?? null);

      const { data: lines } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);
      setItems((lines as OrderItem[]) ?? []);
    }

    load();
    const ch = supabase
      .channel(`driver-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, supabase]);

  const merchant = order?.merchants as
    | { name: string; latitude: number; longitude: number; address: string | null }
    | { name: string; latitude: number; longitude: number; address: string | null }[]
    | undefined;
  const shop = Array.isArray(merchant) ? merchant[0] : merchant;
  const customer = order ? pickOrderCustomer(order.profiles) : undefined;

  const addr = order?.delivery_address ?? "";
  const isTransit = order ? isTransitOrder(addr) : false;
  const isFood = order ? !isTransitOrder(addr) : false;
  const transitKind = order ? getTransitKind(addr) : null;
  const isPaket = transitKind === "paket";
  const isPassenger = isTransit && !isPaket;
  const legs = order ? parseTransitLegs(addr) : null;

  const pickupLat = isTransit ? order?.pickup_lat : shop?.latitude;
  const pickupLng = isTransit ? order?.pickup_lng : shop?.longitude;

  const isMine = order?.driver_id === driver?.id;
  const { unread: chatUnread } = useDriverOrderChatNotify(
    isMine && order?.driver_id ? orderId : null,
    userId
  );
  const canAccept =
    order && !order.driver_id && ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);
  const total = order ? Number(order.total_product_amount) + Number(order.delivery_fee) : 0;

  async function acceptJob() {
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/accept-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal ambil order");
      return;
    }
    router.refresh();
  }

  async function pickupOrder() {
    const ok = isPaket
      ? confirm("Paket sudah diambil dari pengirim?\n\nMulai antar ke lokasi penerima.")
      : isPassenger
        ? confirm(
            `Penumpang ${customer?.name ?? "penumpang"} sudah naik?\n\nMulai perjalanan ke lokasi tujuan.`
          )
        : confirm("Sudah menerima paket dari restoran?");
    if (!ok) return;

    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(
        j.error ??
          (isTransit ? "Gagal mulai perjalanan" : "Gagal ambil pesanan")
      );
      return;
    }
    router.refresh();
  }

  async function completeDelivery() {
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal menyelesaikan");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (j.pointsAwarded) {
      alert(
        isPaket
          ? `PAKET terkirim! +${j.pointsAwarded} poin reward`
          : isPassenger
            ? `${channelLabel(addr)} selesai! +${j.pointsAwarded} poin reward`
            : `Pengantaran selesai! +${j.pointsAwarded} poin reward`
      );
    }
    router.push("/driver");
  }

  if (profileLoading || !order) {
    return <p className="p-6 text-center text-muted-foreground">Memuat order...</p>;
  }

  const title = isTransit ? channelLabel(addr) : (shop?.name ?? KULINER_FOOD_LABEL);
  const customerRole = isPaket ? "Customer" : isPassenger ? "Penumpang" : "Customer";

  return (
    <main className="space-y-4 px-4 py-4">
      <div className={cn("glass-card space-y-2 border p-4", driverCardBorderClass(addr))}>
        <DriverChannelBadge deliveryAddress={addr} />
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-xs text-muted-foreground">
          {driverOrderStatusLabel(addr, order.order_status)}
        </p>
      </div>

      {pickupLat != null && pickupLng != null && (
        <DriverRouteMap
          merchantLat={pickupLat}
          merchantLng={pickupLng}
          deliveryLat={order.delivery_lat}
          deliveryLng={order.delivery_lng}
          driverLat={driver?.current_lat}
          driverLng={driver?.current_lng}
        />
      )}

      {customer && (
        <section className="glass-card p-4 text-sm">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <div>
              <p className="font-medium text-white">{customerRole}</p>
              <p className="text-sm font-semibold text-cyan-200">{customer.name}</p>
              {customer.phone && (
                <p className="mt-1 text-xs text-muted-foreground">
                  HP: {customer.phone} · gunakan chat in-app untuk kontak
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="glass-card space-y-3 p-4 text-sm">
        {isTransit ? (
          <DriverOrderRouteLine deliveryAddress={addr} />
        ) : (
          <>
            <div className="flex items-start gap-2">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <div>
                <p className="font-medium text-white">Ambil di toko</p>
                <p className="text-xs text-muted-foreground">{shop?.address ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div>
                <p className="font-medium text-white">Antar ke</p>
                <p className="text-xs text-muted-foreground">{order.delivery_address}</p>
              </div>
            </div>
          </>
        )}
      </section>

      {isFood && items.length > 0 && (
        <section className="glass-card p-4">
          <p className="text-sm font-medium text-white">Item pesanan</p>
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between text-muted-foreground">
                <span>
                  {i.quantity}× {i.product_name}
                </span>
                <span>{formatIdr(Number(i.price) * i.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card p-4">
        <div className="flex justify-between font-bold text-white">
          <span>{isTransit ? "Tarif layanan" : "Total"}</span>
          <span className="text-cyan-300">{formatIdr(total)}</span>
        </div>
        {isFood && (
          <p className="mt-1 text-xs text-muted-foreground">
            Ongkir: {formatIdr(Number(order.delivery_fee))}
          </p>
        )}
      </section>

      {isMine &&
        order.driver_id &&
        (isOrderChatOpen(order) || isOrderChatClosed(order)) && (
          <DriverOrderChatButton
            orderId={orderId}
            orderStatus={order.order_status}
            driverId={order.driver_id}
            unread={chatUnread}
          />
        )}

      <div className="space-y-2 pb-4">
        {canAccept && (
          <Button
            className={cn(
              "h-12 w-full rounded-2xl font-semibold",
              isPaket
                ? "bg-amber-600 hover:bg-amber-500"
                : isPassenger
                  ? "bg-cyan-600 hover:bg-cyan-500"
                  : "bg-emerald-600 hover:bg-emerald-500"
            )}
            disabled={busy || driver?.status === "offline"}
            onClick={acceptJob}
          >
            {isPaket
              ? "Terima order PAKET"
              : isPassenger
                ? `Terima order ${channelLabel(addr)}`
                : "Ambil order ini"}
          </Button>
        )}
        {isMine && isFood && ["paid", "preparing"].includes(order.order_status) && (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-100">
            Tunggu merchant menandai pesanan siap diambil
          </p>
        )}
        {isMine && isPassenger && order.order_status === "ready_for_pickup" && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-xs text-cyan-100">
            Temui penumpang di {legs?.pickup ?? "titik jemput"}
          </div>
        )}
        {isMine && isPaket && order.order_status === "ready_for_pickup" && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-100">
            Ambil paket di {legs?.pickup ?? "lokasi pengirim"}
          </div>
        )}
        {isMine && order.order_status === "ready_for_pickup" && isPassenger && (
          <Button
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 font-semibold text-slate-950"
            disabled={busy}
            onClick={pickupOrder}
          >
            <Bike className="mr-2 h-4 w-4" />
            Penumpang naik — mulai perjalanan
          </Button>
        )}
        {isMine && order.order_status === "ready_for_pickup" && isPaket && (
          <Button
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 font-semibold text-slate-950"
            disabled={busy}
            onClick={pickupOrder}
          >
            <Package className="mr-2 h-4 w-4" />
            Paket diambil — mulai antar
          </Button>
        )}
        {isMine && order.order_status === "ready_for_pickup" && isFood && (
          <Button
            className="h-12 w-full rounded-2xl bg-orange-500 font-semibold"
            disabled={busy}
            onClick={pickupOrder}
          >
            <Package className="mr-2 h-4 w-4" />
            Ambil pesanan di toko
          </Button>
        )}
        {isMine && order.order_status === "on_the_way" && (
          <Button
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 font-semibold text-slate-950"
            disabled={busy}
            onClick={completeDelivery}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {isPaket
              ? `Selesai kirim paket (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`
              : isPassenger
                ? `Selesai ${channelLabel(addr)} (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`
                : `Selesai antar (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`}
          </Button>
        )}
      </div>
    </main>
  );
}
