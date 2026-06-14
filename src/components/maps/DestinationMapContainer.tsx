"use client";

import { useState } from "react";
import { CustomerMapIframe } from "@/components/maps/customer-map-iframe";
import {
  CustomerMapPreviewButton,
  CustomerMapSheet,
} from "@/components/maps/customer-map-sheet";

export function DestinationMapContainer({
  lat,
  lng,
  hubLat,
  hubLng,
  hubLabel = "J",
  flyToTrigger = 0,
  onLocationChange,
  height = 240,
}: {
  lat: number;
  lng: number;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  flyToTrigger?: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CustomerMapPreviewButton
        lat={lat}
        lng={lng}
        label="Ketuk untuk atur tujuan di peta"
        onOpen={() => setOpen(true)}
        ringClass="ring-cyan-500/30"
      />

      <CustomerMapSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Titik tujuan"
        subtitle="Geser pin biru atau ketuk peta"
      >
        <div className="h-full min-h-[50vh] p-3">
          <CustomerMapIframe
            kind="destination"
            lat={lat}
            lng={lng}
            hubLat={hubLat}
            hubLng={hubLng}
            hubLabel={hubLabel}
            height={Math.max(height, 360)}
            flyToTrigger={flyToTrigger}
            onLocationChange={onLocationChange}
            ringClass="ring-cyan-500/30"
            title="Peta tujuan"
          />
        </div>
      </CustomerMapSheet>
    </>
  );
}
