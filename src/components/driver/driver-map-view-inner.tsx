"use client";

import { GpsLockMapInner, type GpsLockMapPoint } from "@/components/maps/gps-lock-map-inner";
import { JALAN_WIRA } from "@/lib/geo-config";

export function DriverMapViewInner({
  merchantLat,
  merchantLng,
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
  driverAccuracyM,
  followDriver = false,
  lockDriverZoom = true,
  navigationMode = false,
  className = "h-full w-full",
}: {
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
  className?: string;
}) {
  const hasRoute =
    merchantLat != null &&
    merchantLng != null &&
    deliveryLat != null &&
    deliveryLng != null;

  const hasDriver = driverLat != null && driverLng != null;

  const centerLat = hasDriver
    ? driverLat!
    : hasRoute
      ? (merchantLat! + deliveryLat!) / 2
      : JALAN_WIRA.latitude;

  const centerLng = hasDriver
    ? driverLng!
    : hasRoute
      ? (merchantLng! + deliveryLng!) / 2
      : JALAN_WIRA.longitude;

  const navTarget =
    navigationMode && deliveryLat != null && deliveryLng != null
      ? { lat: deliveryLat, lng: deliveryLng }
      : null;

  const extraPoints: GpsLockMapPoint[] = [];
  if (hasRoute && !navigationMode) {
    extraPoints.push({ lat: merchantLat!, lng: merchantLng!, label: "T", color: "#f97316" });
    extraPoints.push({ lat: deliveryLat!, lng: deliveryLng!, label: "C", color: "#22d3ee" });
  } else if (hasRoute && navigationMode) {
    extraPoints.push({ lat: merchantLat!, lng: merchantLng!, label: "T", color: "#9a3412" });
  }

  const routeLine: [number, number][] | undefined =
    hasRoute && !navigationMode
      ? [
          [merchantLat!, merchantLng!],
          [deliveryLat!, deliveryLng!],
        ]
      : undefined;

  const mapCenterLat = navigationMode && hasDriver ? driverLat! : centerLat;
  const mapCenterLng = navigationMode && hasDriver ? driverLng! : centerLng;

  return (
    <GpsLockMapInner
      userLat={mapCenterLat}
      userLng={mapCenterLng}
      userAccuracyM={hasDriver ? driverAccuracyM : null}
      hubLat={JALAN_WIRA.latitude}
      hubLng={JALAN_WIRA.longitude}
      hubLabel="W"
      showRadius={!hasRoute && !navigationMode}
      followGps={hasDriver && (followDriver || navigationMode)}
      lockZoom={hasDriver && (followDriver || navigationMode) && lockDriverZoom}
      draggableUser={false}
      extraPoints={extraPoints}
      routeLine={routeLine}
      navigationTarget={navTarget}
      className={`${className} z-0 min-h-[280px]`}
    />
  );
}
