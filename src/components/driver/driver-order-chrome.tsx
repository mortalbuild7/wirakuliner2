"use client";

import { Bike, MapPin, Store, Utensils } from "lucide-react";
import { KULINER_FOOD_LABEL, NGOJEK_LABEL, parseNgojekLegs } from "@/lib/order-channel";
import { cn } from "@/lib/utils";

export function DriverChannelBadge({ isRide }: { isRide: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isRide
          ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
          : "border-orange-400/40 bg-orange-500/15 text-orange-200"
      )}
    >
      {isRide ? <Bike className="h-3 w-3" /> : <Utensils className="h-3 w-3" />}
      {isRide ? NGOJEK_LABEL : KULINER_FOOD_LABEL}
    </span>
  );
}

export function DriverOrderRouteLine({
  isRide,
  deliveryAddress,
  merchantName,
}: {
  isRide: boolean;
  deliveryAddress: string;
  merchantName?: string;
}) {
  const legs = isRide ? parseNgojekLegs(deliveryAddress) : null;

  if (isRide && legs) {
    return (
      <div className="space-y-1.5 text-xs">
        <p className="flex items-start gap-1.5 text-emerald-200/90">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-[9px] font-bold text-emerald-100">
            J
          </span>
          <span className="line-clamp-2">{legs.pickup || "Titik jemput"}</span>
        </p>
        <p className="flex items-start gap-1.5 text-cyan-200/90">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span className="line-clamp-2">{legs.destination || "Lokasi tujuan"}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {merchantName && (
        <p className="flex items-center gap-1.5 text-orange-200/90">
          <Store className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <span className="truncate">{merchantName}</span>
        </p>
      )}
      <p className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
        <span className="line-clamp-2">{deliveryAddress}</span>
      </p>
    </div>
  );
}

export function driverCardBorderClass(isRide: boolean) {
  return isRide ? "border-cyan-500/40" : "border-orange-500/40";
}

export function driverCardGlowClass(isRide: boolean) {
  return isRide ? "shadow-cyan-500/10" : "shadow-orange-500/10";
}
