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
  driverOrderStatusLabel,
  isNgojekOrder,
  KULINER_FOOD_LABEL,
  NGOJEK_LABEL,
  parseNgojekLegs,
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
  MessageCircle,
  Package,
  Phone,
  Store,
  User,
} from "lucide-react";
import Link from "next/link";
import { isOrderChatClosed, isOrderChatOpen } from "@/lib/order-chat";

export default function DriverOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { driver, loading: profileLoading } = useDriverProfile();
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

  const isRide = order ? isNgojekOrder(order.delivery_address) : false;
  const legs = order ? parseNgojekLegs(order.delivery_address) : null;
  const pickupLat = isRide ? order?.pickup_lat : shop?.latitude;
  const pickupLng = isRide ? order?.pickup_lng : shop?.longitude;

  const isMine = order?.driver_id === driver?.id;
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
    const ok = isRide
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
      alert(j.error ?? (isRide ? "Gagal mulai perjalanan" : "Gagal ambil pesanan"));
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
        isRide
          ? `NGOJEK selesai! +${j.pointsAwarded} poin reward`
          : `Pengantaran selesai! +${j.pointsAwarded} poin reward`
      );
    }
    router.push("/driver");
  }

  if (profileLoading || !order) {
    return <p className="p-6 text-center text-muted-foreground">Memuat order...</p>;
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <div className={cn("glass-card space-y-2 border p-4", driverCardBorderClass(isRide))}>
        <DriverChannelBadge isRide={isRide} />
        <h1 className="text-xl font-bold text-white">
          {isRide ? NGOJEK_LABEL : (shop?.name ?? KULINER_FOOD_LABEL)}
        </h1>
        <p className="text-xs text-muted-foreground">
          {driverOrderStatusLabel(order.delivery_address, order.order_status)}
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
              <p className="font-medium text-white">{isRide ? "Penumpang" : "Customer"}</p>
              <p className="text-sm font-semibold text-cyan-200">{customer.name}</p>
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {customer.phone}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="glass-card space-y-3 p-4 text-sm">
        {isRide ? (
          <DriverOrderRouteLine
            isRide
            deliveryAddress={order.delivery_address}
          />
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

      {!isRide && items.length > 0 && (
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
          <span>{isRide ? "Tarif ride" : "Total"}</span>
          <span className="text-cyan-300">{formatIdr(total)}</span>
        </div>
        {!isRide && (
          <p className="mt-1 text-xs text-muted-foreground">
            Ongkir: {formatIdr(Number(order.delivery_fee))}
          </p>
        )}
      </section>

      {isMine &&
        order.driver_id &&
        (isOrderChatOpen(order) || isOrderChatClosed(order)) && (
          <Link
            href={`/driver/orders/${orderId}/chat`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            <MessageCircle className="h-4 w-4" />
            {isOrderChatOpen(order)
              ? isRide
                ? "Chat penumpang"
                : "Chat customer"
              : "Riwayat chat"}
          </Link>
        )}

      <div className="space-y-2 pb-4">
        {canAccept && (
          <Button
            className={cn(
              "h-12 w-full rounded-2xl font-semibold",
              isRide ? "bg-cyan-600 hover:bg-cyan-500" : "bg-emerald-600 hover:bg-emerald-500"
            )}
            disabled={busy || driver?.status === "offline"}
            onClick={acceptJob}
          >
            {isRide ? "Terima order NGOJEK" : "Ambil order ini"}
          </Button>
        )}
        {isMine && !isRide && ["paid", "preparing"].includes(order.order_status) && (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-100">
            Tunggu merchant menandai pesanan siap diambil
          </p>
        )}
        {isMine && isRide && order.order_status === "ready_for_pickup" && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-xs text-cyan-100">
            Temui penumpang di {legs?.pickup ?? "titik jemput"}
          </div>
        )}
        {isMine && order.order_status === "ready_for_pickup" && isRide && (
          <Button
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 font-semibold text-slate-950"
            disabled={busy}
            onClick={pickupOrder}
          >
            <Bike className="mr-2 h-4 w-4" />
            Penumpang naik — mulai perjalanan
          </Button>
        )}
        {isMine && order.order_status === "ready_for_pickup" && !isRide && (
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
            {isRide
              ? `Selesai NGOJEK (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`
              : `Selesai antar (+${DRIVER_REWARD_POINTS_PER_ORDER} poin)`}
          </Button>
        )}
      </div>
    </main>
  );
}
