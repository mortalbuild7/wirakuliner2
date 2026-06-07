"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRoadRoute } from "@/lib/road-route";
import { haversineMeters } from "@/lib/geo-distance";

/** Polyline rute jalan driver → tujuan; di-refresh saat posisi berubah signifikan. */
export function useDriverNavRoute(
  enabled: boolean,
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null
): [number, number][] | null {
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const lastFetchFromRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchToRef = useRef<{ lat: number; lng: number } | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !from || !to) {
      setRoute(null);
      lastFetchFromRef.current = null;
      lastFetchToRef.current = null;
      return;
    }

    const prevFrom = lastFetchFromRef.current;
    const prevTo = lastFetchToRef.current;
    const destChanged =
      !prevTo ||
      prevTo.lat !== to.lat ||
      prevTo.lng !== to.lng ||
      haversineMeters(prevTo.lat, prevTo.lng, to.lat, to.lng) > 5;

    const movedEnough =
      !prevFrom ||
      destChanged ||
      haversineMeters(prevFrom.lat, prevFrom.lng, from.lat, from.lng) > 80;

    if (!movedEnough) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    lastFetchFromRef.current = from;
    lastFetchToRef.current = to;

    void fetchRoadRoute(from, to)
      .then((line) => {
        if (line.length >= 2) setRoute(line);
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  return enabled ? route : null;
}
