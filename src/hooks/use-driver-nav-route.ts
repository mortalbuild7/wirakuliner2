"use client";

import { fetchRoadRoute } from "@/lib/road-route";
import { useRoadRoute } from "@/hooks/use-road-route";

/** Polyline rute jalan driver → tujuan; di-refresh saat posisi berubah signifikan. */
export function useDriverNavRoute(
  enabled: boolean,
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null
): [number, number][] | null {
  return useRoadRoute(enabled, from, to, fetchRoadRoute);
}
