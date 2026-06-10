"use client";

import { Bike, Car, MapPin, Package, Store, Utensils } from "lucide-react";
import {
  getTransitKind,
  isTransitOrder,
  KULINER_FOOD_LABEL,
  NGOJEK_LABEL,
  NGOMOBIL_LABEL,
  PAKET_LABEL,
  parseTransitLegs,
  type TransitKind,
} from "@/lib/order-channel";
import { cn } from "@/lib/utils";

const TRANSIT_BADGE: Record<
  TransitKind,
  { label: string; className: string; icon: typeof Bike }
> = {
  ngojek: {
    label: NGOJEK_LABEL,
    className: "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
    icon: Bike,
  },
  ngomobil: {
    label: NGOMOBIL_LABEL,
    className: "border-sky-400/40 bg-sky-500/15 text-sky-200",
    icon: Car,
  },
  paket: {
    label: PAKET_LABEL,
    className: "border-amber-400/40 bg-amber-500/15 text-amber-200",
    icon: Package,
  },
};

export function DriverChannelBadge({ deliveryAddress }: { deliveryAddress: string }) {
  const kind = getTransitKind(deliveryAddress);

  if (kind) {
    const { label, className, icon: Icon } = TRANSIT_BADGE[kind];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          className
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-200">
      <Utensils className="h-3 w-3" />
      {KULINER_FOOD_LABEL}
    </span>
  );
}

export function DriverOrderRouteLine({
  deliveryAddress,
  merchantName,
}: {
  deliveryAddress: string;
  merchantName?: string;
}) {
  const legs = parseTransitLegs(deliveryAddress);

  if (legs) {
    const pickupLabel =
      getTransitKind(deliveryAddress) === "paket" ? "Pengirim" : "Jemput";
    const destLabel =
      getTransitKind(deliveryAddress) === "paket" ? "Penerima" : "Tujuan";

    return (
      <div className="space-y-1.5 text-xs">
        <p className="flex items-start gap-1.5 text-emerald-200/90">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-[9px] font-bold text-emerald-100">
            {pickupLabel.slice(0, 1)}
          </span>
          <span className="line-clamp-2">{legs.pickup || `Titik ${pickupLabel.toLowerCase()}`}</span>
        </p>
        <p className="flex items-start gap-1.5 text-cyan-200/90">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span className="line-clamp-2">
            {legs.destination || `Lokasi ${destLabel.toLowerCase()}`}
          </span>
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

export function driverCardBorderClass(deliveryAddress: string) {
  const kind = getTransitKind(deliveryAddress);
  if (kind === "paket") return "border-amber-500/40";
  if (kind === "ngomobil") return "border-sky-500/40";
  if (kind === "ngojek") return "border-cyan-500/40";
  return "border-orange-500/40";
}

export function driverCardGlowClass(deliveryAddress: string) {
  const kind = getTransitKind(deliveryAddress);
  if (kind === "paket") return "shadow-amber-500/10";
  if (kind === "ngomobil") return "shadow-sky-500/10";
  if (kind === "ngojek") return "shadow-cyan-500/10";
  return "shadow-orange-500/10";
}

export function isFoodDeliveryOrder(deliveryAddress: string) {
  return !isTransitOrder(deliveryAddress);
}
