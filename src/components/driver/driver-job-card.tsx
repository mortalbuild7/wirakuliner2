"use client";

import Link from "next/link";
import { formatIdr } from "@/lib/utils";
import { channelLabel } from "@/lib/order-channel";
import type { Order } from "@/types/database";
import { pickOrderCustomer } from "@/lib/order-customer";
import { MapPin, ChevronRight } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  pending_payment: "Menunggu bayar",
  paid: "Order baru",
  preparing: "Diproses toko",
  ready_for_pickup: "Siap diambil",
  on_the_way: "Dalam perjalanan",
  negotiating: "Nego ongkir",
};

export function DriverJobCard({
  order,
  badge,
}: {
  order: Order & {
    merchants?: { name: string } | { name: string }[];
    profiles?: { name: string; phone: string | null } | { name: string; phone: string | null }[];
  };
  badge?: string;
}) {
  const merchant = Array.isArray(order.merchants)
    ? order.merchants[0]?.name
    : order.merchants?.name;
  const customer = pickOrderCustomer(order.profiles);

  const label =
    badge ??
    (order.negotiation_status === "negotiating"
      ? STATUS_BADGE.negotiating
      : STATUS_BADGE[order.order_status] ?? order.order_status);

  const total = Number(order.total_product_amount) + Number(order.delivery_fee);

  return (
    <Link
      href={`/driver/orders/${order.id}`}
      className="glass-card block p-4 transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{merchant ?? "Toko"}</p>
          {customer && (
            <p className="mt-0.5 truncate text-xs font-medium text-cyan-200">
              Customer: {customer.name}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {channelLabel(order.delivery_address)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="line-clamp-2">{order.delivery_address}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-medium text-cyan-300">{formatIdr(total)}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
