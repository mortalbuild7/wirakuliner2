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
    className: "border-cyan-700 bg-cyan-50 text-cyan-900",
    icon: Bike,
  },
  ngomobil: {
    label: NGOMOBIL_LABEL,
    className: "border-sky-700 bg-sky-50 text-sky-900",
    icon: Car,
  },
  paket: {
    label: PAKET_LABEL,
    className: "border-amber-700 bg-amber-50 text-amber-950",
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
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          className
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-700 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-950">
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
      <div className="space-y-3">
        <div>
          <p className="driver-address-label flex items-center gap-1 text-emerald-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
              {pickupLabel.slice(0, 1)}
            </span>
            Alamat {pickupLabel}
          </p>
          <p className="driver-address-value mt-1 line-clamp-3">
            {legs.pickup || `Titik ${pickupLabel.toLowerCase()}`}
          </p>
        </div>
        <div>
          <p className="driver-address-label flex items-center gap-1 text-sky-800">
            <MapPin className="h-4 w-4 text-sky-700" />
            Alamat {destLabel}
          </p>
          <p className="driver-address-value mt-1 line-clamp-3">
            {legs.destination || `Lokasi ${destLabel.toLowerCase()}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {merchantName && (
        <div>
          <p className="driver-address-label flex items-center gap-1 text-orange-800">
            <Store className="h-4 w-4 text-orange-700" />
            Restoran
          </p>
          <p className="driver-address-value mt-1 truncate">{merchantName}</p>
        </div>
      )}
      <div>
        <p className="driver-address-label flex items-center gap-1 text-sky-800">
          <MapPin className="h-4 w-4 text-sky-700" />
          Alamat Antar
        </p>
        <p className="driver-address-value mt-1 line-clamp-3">{deliveryAddress}</p>
      </div>
    </div>
  );
}

export function driverCardBorderClass(deliveryAddress: string) {
  const kind = getTransitKind(deliveryAddress);
  if (kind === "paket") return "border-amber-400";
  if (kind === "ngomobil") return "border-sky-400";
  if (kind === "ngojek") return "border-cyan-400";
  return "border-orange-400";
}

export function driverCardGlowClass(deliveryAddress: string) {
  const kind = getTransitKind(deliveryAddress);
  if (kind === "paket") return "shadow-amber-200/50";
  if (kind === "ngomobil") return "shadow-sky-200/50";
  if (kind === "ngojek") return "shadow-cyan-200/50";
  return "shadow-orange-200/50";
}

export function isFoodDeliveryOrder(deliveryAddress: string) {
  return !isTransitOrder(deliveryAddress);
}
