"use client";

import { useEffect, useRef, useState } from "react";
import type { RoutePoint } from "@/lib/road-route";
import { haversineMeters } from "@/lib/geo-distance";

type RouteFetcher = (from: RoutePoint, to: RoutePoint) => Promise<[number, number][]>;

/** Polyline rute jalan; refresh saat posisi asal berubah signifikan. */
export function useRoadRoute(
  enabled: boolean,
  from: RoutePoint | null,
  to: RoutePoint | null,
  fetchRoute: RouteFetcher
): [number, number][] | null {
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const lastFetchFromRef = useRef<RoutePoint | null>(null);
  const lastFetchToRef = useRef<RoutePoint | null>(null);
  const fetchingRef = useRef(false);
  const fetchRouteRef = useRef(fetchRoute);
  fetchRouteRef.current = fetchRoute;

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

    void fetchRouteRef
      .current(from, to)
      .then((line) => {
        if (line.length >= 2) setRoute(line);
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  return enabled ? route : null;
}
