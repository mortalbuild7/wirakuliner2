"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { DriverNegotiation } from "@/components/driver/driver-negotiation";
import { DriverRouteMap } from "@/components/driver/driver-route-map";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import type { Order, OrderItem } from "@/types/database";
import { pickOrderCustomer } from "@/lib/order-customer";
import { CheckCircle, MapPin, Package, Phone, Store, User } from "lucide-react";

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

  useDriverLocation(driver?.id, driver?.status, Boolean(driver && order?.order_status === "on_the_way"));

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

  const isMine = order?.driver_id === driver?.id;
  const isNego = order?.negotiation_status === "negotiating";
  const canAccept = order && !order.driver_id && ["paid", "preparing"].includes(order.order_status);
  const total =
    order ? Number(order.total_product_amount) + Number(order.delivery_fee) : 0;

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
    setBusy(true);
    const res = await fetchWithDriverAuth("/api/driver/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Gagal ambil pesanan");
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
      alert(`Pengantaran selesai! +${j.pointsAwarded} poin reward`);
    }
    router.push("/driver");
  }

  if (profileLoading || !order) {
    return <p className="p-6 text-center text-muted-foreground">Memuat order...</p>;
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-white">{shop?.name ?? "Order"}</h1>
        <p className="text-xs text-muted-foreground">
          {ORDER_STATUS_LABEL[order.order_status] ?? order.order_status}
        </p>
      </div>

      {shop && (
        <DriverRouteMap
          merchantLat={shop.latitude}
          merchantLng={shop.longitude}
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
              <p className="font-medium text-white">Customer</p>
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

      <section className="glass-card space-y-2 p-4 text-sm">
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
      </section>

      <section className="glass-card p-4">
        <p className="text-sm font-medium text-white">Item</p>
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
        <div className="mt-3 flex justify-between border-t border-white/10 pt-2 font-bold text-white">
          <span>Total</span>
          <span className="text-cyan-300">{formatIdr(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ongkir: {formatIdr(Number(order.delivery_fee))}
        </p>
      </section>

      {isNego && driver && userId && (
        <DriverNegotiation orderId={orderId} driverId={driver.id} userId={userId} />
      )}

      <div className="space-y-2 pb-4">
        {canAccept && (
          <Button
            className="h-12 w-full rounded-2xl bg-emerald-600 font-semibold"
            disabled={busy || driver?.status === "offline"}
            onClick={acceptJob}
          >
            Ambil order ini
          </Button>
        )}
        {isMine && ["paid", "preparing"].includes(order.order_status) && (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-100">
            Tunggu merchant menandai pesanan siap diambil
          </p>
        )}
        {isMine && order.order_status === "ready_for_pickup" && (
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
            Selesai antar (+100 poin)
          </Button>
        )}
      </div>
    </main>
  );
}
