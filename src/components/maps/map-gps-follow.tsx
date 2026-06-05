"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Ikuti koordinat GPS realtime; kunci zoom (tidak bisa zoom out/in manual).
 */
export function MapGpsFollow({
  lat,
  lng,
  zoom,
  follow,
  lockZoom = false,
}: {
  lat: number;
  lng: number;
  zoom: number;
  follow: boolean;
  lockZoom?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!follow) {
      map.setMinZoom(0);
      map.setMaxZoom(22);
      return;
    }

    const z = zoom;
    if (lockZoom) {
      map.setMinZoom(z);
      map.setMaxZoom(z);
    }
    map.setView([lat, lng], z, { animate: false });
  }, [lat, lng, zoom, follow, lockZoom, map]);

  return null;
}
