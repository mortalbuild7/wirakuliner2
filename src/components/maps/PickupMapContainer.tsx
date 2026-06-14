"use client";

import dynamic from "next/dynamic";
import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";

/** Lazy-load Leaflet — hanya di browser (window tidak ada di SSR). */
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

/** Props peta pilih titik jemput — center-pinned marker + callback onMapIdle. */
export type PickupMapContainerProps = {
  /** Lintang pusat peta / lokasi jemput saat ini. */
  centerLat: number;
  /** Bujur pusat peta / lokasi jemput saat ini. */
  centerLng: number;
  /** Lintang hub operasional (opsional radius lingkaran). */
  hubLat: number;
  /** Bujur hub operasional. */
  hubLng: number;
  hubLabel?: string;
  /** Tampilkan lingkaran radius layanan di sekitar hub. */
  showRadius?: boolean;
  /** Counter dari store — naik saat search/autofill agar peta pan ke koordinat baru. */
  panTrigger?: number;
  /** Dipanggil saat geser peta selesai — emit lat/lng pusat layar. */
  onMapIdle: (lat: number, lng: number) => void;
  /** Tinggi peta dalam piksel. */
  height?: number;
};

/**
 * Peta "Pilih lewat Map" untuk NGOJEK & NGOMOBIL.
 * Pin tetap di tengah layar; peta yang bergerak (center-pinned marker).
 * Koordinat akhir ditangkap via onMapIdle → reverse geocode di parent.
 */
export function PickupMapContainer(props: PickupMapContainerProps) {
  return (
    <MapLoadErrorBoundary title="Peta jemput gagal dimuat">
      <div className="customer-map-wrap relative z-0 isolate">
        <PickupMapInner {...props} />
      </div>
    </MapLoadErrorBoundary>
  );
}
