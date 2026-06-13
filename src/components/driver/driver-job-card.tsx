"use client";

import { cn, formatIdr } from "@/lib/utils";
import {
  channelLabel,
  driverOrderStatusLabel,
  getTransitKind,
  isTransitOrder,
  KULINER_FOOD_LABEL,
} from "@/lib/order-channel";
import type { Order } from "@/types/database";
import { pickOrderCustomer } from "@/lib/order-customer";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  DriverChannelBadge,
  DriverOrderRouteLine,
  driverCardBorderClass,
  driverCardGlowClass,
} from "@/components/driver/driver-order-chrome";

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
  const addr = order.delivery_address;

  const isTransit = isTransitOrder(addr);
  const transitKind = getTransitKind(addr);
  const statusLabel =
    badge ?? driverOrderStatusLabel(addr, order.order_status);
  const total = Number(order.total_product_amount) + Number(order.delivery_fee);

  const title = isTransit ? channelLabel(addr) : (merchant ?? KULINER_FOOD_LABEL);
  const customerRole =
    transitKind === "paket" ? "Customer" : isTransit ? "Penumpang" : "Customer";

  return (
    <Link
      href={`/driver/orders/${order.id}`}
      className={cn(
        "glass-card block p-4 transition active:scale-[0.99]",
        `border-2 ${driverCardBorderClass(addr)} shadow-md ${driverCardGlowClass(addr)}`
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <DriverChannelBadge deliveryAddress={addr} />
          <p className="truncate text-base font-bold text-slate-900">{title}</p>
          {customer && (
            <p className="truncate text-sm font-semibold text-slate-700">
              {customerRole}: {customer.name}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold",
            isTransit
              ? transitKind === "paket"
                ? "border-amber-700 bg-amber-50 text-amber-950"
                : "border-cyan-700 bg-cyan-50 text-cyan-900"
              : "border-emerald-700 bg-emerald-50 text-emerald-900"
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-3">
        <DriverOrderRouteLine
          deliveryAddress={addr}
          merchantName={isTransit ? undefined : merchant}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <div>
          <span className="text-xl font-bold text-slate-900">{formatIdr(total)}</span>
          <span className="ml-2 text-xs font-semibold text-slate-600">
            {isTransit ? "tarif pendapatan" : "total + ongkir"}
          </span>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-500" />
      </div>
    </Link>
  );
}
