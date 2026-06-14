"use client";

import { useState } from "react";
import { MapLoadErrorBoundary } from "@/components/maps/map-error-boundary";
import { CustomerMapIframe } from "@/components/maps/customer-map-iframe";
import {
  CustomerMapPreviewButton,
  CustomerMapSheet,
} from "@/components/maps/customer-map-sheet";

/** Props peta pilih titik jemput — center-pinned marker + callback onMapIdle. */
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
 * Peta jemput dibuka di sheet fullscreen — menghindari tile Leaflet menimpa header saat scroll.
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
  const [open, setOpen] = useState(false);

  return (
    <MapLoadErrorBoundary title="Peta jemput gagal dimuat">
      <CustomerMapPreviewButton
        lat={centerLat}
        lng={centerLng}
        label="Ketuk untuk atur di peta"
        onOpen={() => setOpen(true)}
      />

      <CustomerMapSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Titik jemput"
        subtitle="Geser peta — pin hijau tetap di tengah"
      >
        <div className="h-full min-h-[50vh] p-3">
          <CustomerMapIframe
            kind="pickup"
            lat={centerLat}
            lng={centerLng}
            hubLat={hubLat}
            hubLng={hubLng}
            height={Math.max(height, 360)}
            showRadius={showRadius}
            panTrigger={panTrigger}
            onLocationChange={onMapIdle}
            title="Peta titik jemput"
          />
        </div>
      </CustomerMapSheet>
    </MapLoadErrorBoundary>
  );
}
