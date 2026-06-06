"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRoadRoute } from "@/lib/road-route";
import { haversineMeters } from "@/lib/geo-distance";

/** Polyline rute jalan driver → customer; di-refresh saat posisi driver berubah signifikan. */
export function useDriverNavRoute(
  enabled: boolean,
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null
): [number, number][] | null {
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const lastFetchFromRef = useRef<{ lat: number; lng: number } | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !from || !to) {
      setRoute(null);
      lastFetchFromRef.current = null;
      return;
    }

    const prev = lastFetchFromRef.current;
    const movedEnough =
      !prev || haversineMeters(prev.lat, prev.lng, from.lat, from.lng) > 120;

    if (!movedEnough) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    lastFetchFromRef.current = from;

    void fetchRoadRoute(from, to)
      .then((line) => setRoute(line))
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  return enabled ? route : null;
}
