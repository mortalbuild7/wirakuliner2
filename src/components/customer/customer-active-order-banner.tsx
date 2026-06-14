"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bike, Car, ChevronRight, Package } from "lucide-react";
import {
  channelLabelFromRecord,
  customerTrackerStatusLabel,
  parseTransitLegs,
} from "@/lib/order-channel";
import {
  clearActiveTransitOrderHint,
  customerActiveOrderHref,
  persistActiveTransitOrderHint,
  WIRA_ACTIVE_ORDER_CHANGED_EVENT,
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

/**
 * Banner beranda — pesanan transit (NGOJEK / NGOMOBIL / PAKET) yang masih berjalan.
 * Hanya tampil setelah sinkron API (hindari cache localStorage yang basi).
 */
export function CustomerActiveOrderBanner({ className }: { className?: string }) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer/orders/active", { credentials: "include" });
      if (res.status === 401) {
        clearActiveTransitOrderHint();
        setOrder(null);
        return;
      }

      if (!res.ok) {
        clearActiveTransitOrderHint();
        setOrder(null);
        return;
      }

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
      setOrder(null);
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
    const onActiveOrderChanged = () => {
      void load();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(WIRA_ACTIVE_ORDER_CHANGED_EVENT, onActiveOrderChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(WIRA_ACTIVE_ORDER_CHANGED_EVENT, onActiveOrderChanged);
    };
  }, [load]);

  if (loading || !order) {
    return null;
  }

  const Icon = serviceIcon(order.service_type);
  const channel = channelLabelFromRecord(order);
  const legs = parseTransitLegs(order.delivery_address);
  const statusLabel = customerTrackerStatusLabel(order);
  const routeHint =
    legs?.pickup && legs?.destination
      ? `${legs.pickup} → ${legs.destination}`
      : order.delivery_address;
  const isPendingPayment = order.order_status === "pending_payment";
  const href = customerActiveOrderHref(order);
  const ctaLabel = isPendingPayment ? "Bayar" : "Lacak";
  const headline = isPendingPayment
    ? "Pesanan menunggu pembayaran"
    : "Pesanan sedang berjalan";

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl border p-4 shadow-sm transition active:scale-[0.99] hover:shadow-md",
        isPendingPayment
          ? "border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 hover:border-amber-400"
          : "border-emerald-300 bg-gradient-to-r from-emerald-50 to-sky-50 hover:border-emerald-400",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md",
            isPendingPayment ? "bg-amber-600" : "bg-emerald-600"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-xs font-bold uppercase tracking-wide",
              isPendingPayment ? "text-amber-800" : "text-emerald-800"
            )}
          >
            {headline}
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{channel}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{routeHint}</p>
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold ring-1",
              isPendingPayment
                ? "text-amber-800 ring-amber-200"
                : "text-emerald-800 ring-emerald-200"
            )}
          >
            {statusLabel}
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col items-end gap-1",
            isPendingPayment ? "text-amber-800" : "text-emerald-800"
          )}
        >
          <span className="text-[11px] font-bold">{ctaLabel}</span>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </Link>
  );
}
