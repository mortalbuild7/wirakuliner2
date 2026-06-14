"use client";

import dynamic from "next/dynamic";
import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";
import type { RideMapInnerProps } from "@/components/maps/ride-map-inner";

const RideMapInner = dynamic(
  () => import("@/components/maps/ride-map-inner").then((m) => m.RideMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-600">
        Memuat peta...
      </div>
    ),
  }
);

export type RideMapContainerProps = RideMapInnerProps;

/** Peta ride tunggal — alur jemput (kunci) lalu tujuan. */
export function RideMapContainer(props: RideMapContainerProps) {
  return (
    <MapLoadErrorBoundary title="Peta gagal dimuat">
      <RideMapInner {...props} />
    </MapLoadErrorBoundary>
  );
}
