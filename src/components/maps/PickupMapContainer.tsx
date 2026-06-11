"use client";

import dynamic from "next/dynamic";
import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";

const PickupMapInner = dynamic(
  () =>
    import("@/components/maps/pickup-map-inner").then((m) => m.PickupMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[240px] items-center justify-center rounded-2xl bg-emerald-950/40 text-sm text-emerald-200/80">
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

/**
 * Peta pilih titik jemput — center-pinned marker, koordinat dari moveend.
 */
export function PickupMapContainer(props: PickupMapContainerProps) {
  return (
    <MapLoadErrorBoundary title="Peta jemput gagal dimuat">
      <PickupMapInner {...props} />
    </MapLoadErrorBoundary>
  );
}
