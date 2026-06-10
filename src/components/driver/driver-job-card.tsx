"use client";

import Link from "next/link";
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
        `border ${driverCardBorderClass(addr)} shadow-lg ${driverCardGlowClass(addr)}`
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <DriverChannelBadge deliveryAddress={addr} />
          <p className="truncate font-semibold text-white">{title}</p>
          {customer && (
            <p className="truncate text-xs font-medium text-cyan-200">
              {customerRole}: {customer.name}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
            isTransit
              ? transitKind === "paket"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
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
          <span className="font-medium text-cyan-300">{formatIdr(total)}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {isTransit ? "tarif layanan" : "total + ongkir"}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
