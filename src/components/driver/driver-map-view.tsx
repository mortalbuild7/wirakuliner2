"use client";

import dynamic from "next/dynamic";
import type { DriverNavTarget } from "@/lib/driver-map-nav";

const Inner = dynamic(
  () => import("@/components/driver/driver-map-view-inner").then((m) => m.DriverMapViewInner),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-900" /> }
);

type Props = {
  merchantLat?: number;
  merchantLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  driverLat?: number | null;
  driverLng?: number | null;
  driverAccuracyM?: number | null;
  followDriver?: boolean;
  lockDriverZoom?: boolean;
  navigationMode?: boolean;
  navigationTarget?: DriverNavTarget | null;
  navigationRouteLine?: [number, number][];
  className?: string;
};

export function DriverMapView(props: Props) {
  return <Inner {...props} />;
}
