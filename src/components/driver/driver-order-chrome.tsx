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

export function transitPickupBoxClass(_kind: TransitKind | null) {
  return "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2";
}

export function transitDestBoxClass(kind: TransitKind | null) {
  if (kind === "ngomobil") {
    return "rounded-xl border border-sky-300 bg-sky-50 px-3 py-2";
  }
  if (kind === "paket") {
    return "rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2";
  }
  return "rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2";
}

export function transitCustomerBoxClass(kind: TransitKind | null) {
  if (kind === "ngomobil") {
    return "rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2";
  }
  return "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2";
}

export function transitCustomerRoleLabel(kind: TransitKind | null, isTransit: boolean) {
  if (!isTransit) return "Customer";
  if (kind === "paket") return "Customer";
  return "Penumpang";
}

export function transitPassengerActionClass(kind: TransitKind | null) {
  if (kind === "ngomobil") {
    return "bg-gradient-to-r from-sky-600 to-sky-500 font-semibold text-white shadow-md";
  }
  return "bg-gradient-to-r from-cyan-500 to-emerald-500 font-semibold text-slate-950";
}

export function transitNavActionClass(kind: TransitKind | null) {
  if (kind === "ngomobil") {
    return "bg-gradient-to-r from-sky-600 to-sky-500 font-semibold text-white shadow-md";
  }
  return "bg-gradient-to-r from-sky-500 to-cyan-500 font-semibold text-slate-950";
}

export function driverOrderCardClass(deliveryAddress: string) {
  const kind = getTransitKind(deliveryAddress);
  if (kind === "ngomobil") {
    return "driver-order-card border-sky-300 bg-white text-slate-900 shadow-xl";
  }
  if (kind === "ngojek") {
    return "driver-order-card border-cyan-300 bg-white text-slate-900 shadow-xl";
  }
  if (kind === "paket") {
    return "driver-order-card border-amber-300 bg-white text-slate-900 shadow-xl";
  }
  return "driver-order-card border-slate-200 bg-white text-slate-900 shadow-xl";
}

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
    const kind = getTransitKind(deliveryAddress);
    const pickupLabel = kind === "paket" ? "Pengirim" : "Jemput";
    const destLabel = kind === "paket" ? "Penerima" : "Tujuan";
    const PickupIcon = kind === "ngomobil" ? Car : kind === "paket" ? Package : Bike;

    return (
      <div className="space-y-3">
        <div className={transitPickupBoxClass(kind)}>
          <p className="driver-address-label flex items-center gap-1 text-emerald-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-900">
              <PickupIcon className="h-3 w-3" />
            </span>
            Alamat {pickupLabel}
          </p>
          <p className="driver-address-value mt-1 line-clamp-3 text-slate-900">
            {legs.pickup || `Titik ${pickupLabel.toLowerCase()}`}
          </p>
        </div>
        <div className={transitDestBoxClass(kind)}>
          <p
            className={cn(
              "driver-address-label flex items-center gap-1",
              kind === "ngomobil" ? "text-sky-900" : "text-sky-900"
            )}
          >
            <MapPin className={cn("h-4 w-4", kind === "ngomobil" ? "text-sky-700" : "text-sky-700")} />
            Alamat {destLabel}
          </p>
          <p className="driver-address-value mt-1 line-clamp-3 text-slate-900">
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

export function transitHeaderTextClass(kind: TransitKind | null) {
  if (kind === "ngomobil") return "text-sky-800";
  if (kind === "paket") return "text-amber-900";
  if (kind === "ngojek") return "text-cyan-800";
  return "text-orange-800";
}

export function transitStatusBadgeClass(kind: TransitKind | null, isTransit = true) {
  if (!isTransit) return "border-orange-300 bg-orange-50 text-orange-950";
  if (kind === "ngomobil") return "border-sky-400 bg-sky-100 text-sky-950";
  if (kind === "paket") return "border-amber-400 bg-amber-100 text-amber-950";
  if (kind === "ngojek") return "border-cyan-400 bg-cyan-100 text-cyan-950";
  return "border-orange-300 bg-orange-50 text-orange-950";
}

export function transitActiveStatusTextClass(kind: TransitKind | null) {
  if (kind === "ngomobil") return "text-sky-900";
  if (kind === "paket") return "text-amber-950";
  if (kind === "ngojek") return "text-cyan-900";
  return "text-emerald-900";
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
