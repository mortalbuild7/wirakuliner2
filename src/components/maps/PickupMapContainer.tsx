"use client";

import dynamic from "next/dynamic";
import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";

const PickupMapInner = dynamic(
  () => import("@/components/maps/pickup-map-inner").then((m) => m.PickupMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-600">
        Memuat peta jemput...
      </div>
    ),
  }
);

export type PickupMapContainerProps = {
  centerLat: number;
  centerLng: number;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  showRadius?: boolean;
  panTrigger?: number;
  onMapIdle: (lat: number, lng: number) => void;
  height?: number;
};

/** Peta jemput inline — satu layer wrapper di PickupMapInner. */
export function PickupMapContainer(props: PickupMapContainerProps) {
  return (
    <MapLoadErrorBoundary title="Peta jemput gagal dimuat">
      <PickupMapInner {...props} />
    </MapLoadErrorBoundary>
  );
}
