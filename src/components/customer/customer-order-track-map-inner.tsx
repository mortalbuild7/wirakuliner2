"use client";

import { GpsLockMapInner } from "@/components/maps/gps-lock-map-inner";

/** Peta lacak pesanan: titik tujuan + posisi driver (motor). */
export function CustomerOrderTrackMapInner({
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
  className = "h-[280px] w-full",
}: {
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
  className?: string;
}) {
  const hasDriver = driverLat != null && driverLng != null;

  const centerLat = hasDriver ? (driverLat! + deliveryLat) / 2 : deliveryLat;
  const centerLng = hasDriver ? (driverLng! + deliveryLng) / 2 : deliveryLng;

  const routeLine: [number, number][] | undefined = hasDriver
    ? [
        [driverLat!, driverLng!],
        [deliveryLat, deliveryLng],
      ]
    : undefined;

  return (
    <GpsLockMapInner
      userLat={hasDriver ? driverLat! : deliveryLat}
      userLng={hasDriver ? driverLng! : deliveryLng}
      hubLat={centerLat}
      hubLng={centerLng}
      hubLabel="T"
      showRadius={false}
      showHubMarker={false}
      followGps={false}
      lockZoom={false}
      extraPoints={
        hasDriver
          ? [{ lat: deliveryLat, lng: deliveryLng, label: "T", color: "#22d3ee" }]
          : []
      }
      routeLine={routeLine}
      userMarkerKind={hasDriver ? "driver" : "customer"}
      className={className}
    />
  );
}
