"use client";

import dynamic from "next/dynamic";

const Inner = dynamic(
  () => import("@/components/driver/driver-route-map-inner").then((m) => m.DriverRouteMapInner),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl bg-white/5" /> }
);

export function DriverRouteMap(props: {
  merchantLat: number;
  merchantLng: number;
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}) {
  return <Inner {...props} />;
}
