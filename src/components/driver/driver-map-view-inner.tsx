"use client";

import { GpsLockMapInner, type GpsLockMapPoint } from "@/components/maps/gps-lock-map-inner";
import { JALAN_WIRA } from "@/lib/geo-config";
import {
  driverNavTargetColor,
  driverNavTargetLabel,
  type DriverNavTarget,
} from "@/lib/driver-map-nav";

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
  navigationTarget,
  navigationRouteLine,
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
  navigationTarget?: DriverNavTarget | null;
  navigationRouteLine?: [number, number][];
  className?: string;
}) {
  const hasMerchant = merchantLat != null && merchantLng != null;
  const hasDelivery = deliveryLat != null && deliveryLng != null;
  const hasRoute = hasMerchant && hasDelivery;
  const hasDriver = driverLat != null && driverLng != null;

  const navDest =
    navigationMode && navigationTarget === "merchant" && hasMerchant
      ? { lat: merchantLat!, lng: merchantLng! }
      : navigationMode && navigationTarget === "customer" && hasDelivery
        ? { lat: deliveryLat!, lng: deliveryLng! }
        : null;

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

  const extraPoints: GpsLockMapPoint[] = [];
  if (hasRoute && !navigationMode) {
    extraPoints.push({ lat: merchantLat!, lng: merchantLng!, label: "T", color: "#f97316" });
    extraPoints.push({ lat: deliveryLat!, lng: deliveryLng!, label: "C", color: "#22d3ee" });
  } else if (navigationMode && navigationTarget === "customer" && hasMerchant) {
    extraPoints.push({ lat: merchantLat!, lng: merchantLng!, label: "T", color: "#9a3412" });
  } else if (navigationMode && navigationTarget === "merchant" && hasDelivery) {
    extraPoints.push({ lat: deliveryLat!, lng: deliveryLng!, label: "C", color: "#155e75" });
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
      showHubMarker={false}
      showRadius={!hasRoute && !navigationMode}
      followGps={hasDriver && (followDriver || navigationMode)}
      lockZoom={hasDriver && (followDriver || navigationMode) && lockDriverZoom}
      draggableUser={false}
      extraPoints={extraPoints}
      routeLine={routeLine}
      navigationRouteLine={navigationRouteLine}
      navigationTarget={navDest}
      navigationTargetLabel={
        navigationTarget ? driverNavTargetLabel(navigationTarget) : "C"
      }
      navigationTargetColor={
        navigationTarget ? driverNavTargetColor(navigationTarget) : "#22d3ee"
      }
      userMarkerKind="driver"
      className={`${className} z-0 min-h-[280px]`}
    />
  );
}
