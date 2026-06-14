"use client";

import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";
import { CustomerMapIframe } from "@/components/maps/customer-map-iframe";

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
 * Peta jemput dalam iframe — mengisolasi tile Leaflet dari header (Chrome Android).
 */
export function PickupMapContainer({
  centerLat,
  centerLng,
  hubLat,
  hubLng,
  showRadius = false,
  panTrigger = 0,
  onMapIdle,
  height = 240,
}: PickupMapContainerProps) {
  return (
    <MapLoadErrorBoundary title="Peta jemput gagal dimuat">
      <CustomerMapIframe
        kind="pickup"
        lat={centerLat}
        lng={centerLng}
        hubLat={hubLat}
        hubLng={hubLng}
        height={height}
        showRadius={showRadius}
        panTrigger={panTrigger}
        onLocationChange={onMapIdle}
        title="Peta titik jemput"
      />
    </MapLoadErrorBoundary>
  );
}
