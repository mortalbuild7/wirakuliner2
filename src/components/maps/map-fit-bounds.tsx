"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

/** Sesuaikan viewport agar semua titik (driver + tujuan) terlihat. */
export function MapFitBounds({
  points,
  maxZoom = 17,
  padding = 48,
}: {
  points: [number, number][];
  maxZoom?: number;
  padding?: number;
}) {
  const map = useMap();
  const pointsKey = points.map((p) => p.join(",")).join("|");

  useEffect(() => {
    if (points.length === 0) return;

    const run = () => {
      if (points.length === 1) {
        map.setView(points[0], Math.min(maxZoom, 16), { animate: false });
        return;
      }

      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, {
        padding: L.point(padding, padding),
        maxZoom,
        animate: false,
      });
    };

    run();
    const t = window.setTimeout(run, 120);
    return () => window.clearTimeout(t);
  }, [pointsKey, map, maxZoom, padding, points]);

  return null;
}
