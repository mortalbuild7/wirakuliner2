"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bike, Car, ChevronRight, Loader2, Package } from "lucide-react";
import {
  channelLabelFromRecord,
  customerTrackerStatusLabel,
  parseTransitLegs,
} from "@/lib/order-channel";
import {
  clearActiveTransitOrderHint,
  persistActiveTransitOrderHint,
  readActiveTransitOrderHint,
  type ActiveTransitOrderHint,
} from "@/lib/customer-active-order";
import type { Order, ServiceType } from "@/types/database";
import { cn } from "@/lib/utils";

type ActiveOrder = Pick<
  Order,
  "id" | "order_status" | "delivery_address" | "service_type" | "driver_id"
>;

function serviceIcon(serviceType?: ServiceType | null) {
  if (serviceType === "NGOMOBIL") return Car;
  if (serviceType === "PAKET") return Package;
  return Bike;
}

function hintToOrder(hint: ActiveTransitOrderHint): ActiveOrder {
  return {
    id: hint.id,
    order_status: hint.order_status,
    delivery_address: hint.delivery_address,
    service_type: hint.service_type ?? null,
    driver_id: hint.driver_id ?? null,
  };
}

/**
 * Banner beranda — pesanan transit (NGOJEK / NGOMOBIL / PAKET) yang masih berjalan.
 * Tahan refresh / tutup browser via localStorage + sinkron API.
 */
export function CustomerActiveOrderBanner({ className }: { className?: string }) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const hint = readActiveTransitOrderHint();
    if (hint) setOrder(hintToOrder(hint));

    try {
      const res = await fetch("/api/customer/orders/active", { credentials: "include" });
      if (res.status === 401) {
        clearActiveTransitOrderHint();
        setOrder(null);
        return;
      }
      if (!res.ok) return;

      const json = (await res.json()) as { order?: ActiveOrder | null };
      const active = json.order ?? null;

      if (active) {
        setOrder(active);
        persistActiveTransitOrderHint({
          id: active.id,
          order_status: active.order_status,
          delivery_address: active.delivery_address,
          service_type: active.service_type,
          driver_id: active.driver_id ?? null,
          updated_at: new Date().toISOString(),
        });
      } else {
        clearActiveTransitOrderHint();
        setOrder(null);
      }
    } catch {
      /* keep local hint if offline */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (loading && !order) {
    return null;
  }

  if (!order) return null;

  const Icon = serviceIcon(order.service_type);
  const channel = channelLabelFromRecord(order);
  const legs = parseTransitLegs(order.delivery_address);
  const statusLabel = customerTrackerStatusLabel(order);
  const routeHint =
    legs?.pickup && legs?.destination
      ? `${legs.pickup} → ${legs.destination}`
      : order.delivery_address;

  return (
    <Link
      href={`/customer/orders/${order.id}`}
      className={cn(
        "block rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-sky-50 p-4 shadow-sm transition active:scale-[0.99] hover:border-emerald-400 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            Pesanan sedang berjalan
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{channel}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{routeHint}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {statusLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-emerald-800">
          <span className="text-[11px] font-bold">Lacak</span>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </Link>
  );
}
