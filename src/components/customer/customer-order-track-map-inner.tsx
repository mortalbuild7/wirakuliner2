"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import { MapFitBounds } from "@/components/maps/map-fit-bounds";
import {
  customerPickupIcon,
  driverMotorcycleIcon,
  ngojekPickupIcon,
} from "@/lib/map-marker-icons";
import { fetchCustomerRoadRoute } from "@/lib/road-route";
import { useRoadRoute } from "@/hooks/use-road-route";
import type { OrderStatus } from "@/types/database";

const MAP_HEIGHT = "h-[300px]";

const navTargetIcon = (label: string, color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

/** Peta lacak pesanan: titik jemput/tujuan + driver + rute jalan (sama seperti navigasi driver). */
export function CustomerOrderTrackMapInner({
  deliveryLat,
  deliveryLng,
  pickupLat,
  pickupLng,
  driverLat,
  driverLng,
  isRide = false,
  orderStatus,
  className = `${MAP_HEIGHT} w-full`,
}: {
  deliveryLat: number;
  deliveryLng: number;
  pickupLat?: number | null;
  pickupLng?: number | null;
  driverLat?: number | null;
  driverLng?: number | null;
  isRide?: boolean;
  orderStatus?: OrderStatus;
  className?: string;
}) {
  const hasDriver =
    driverLat != null &&
    driverLng != null &&
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng);

  const hasPickup =
    pickupLat != null &&
    pickupLng != null &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng);

  const driverNavTarget = useMemo(() => {
    if (!hasDriver) return null;
    if (
      isRide &&
      orderStatus === "ready_for_pickup" &&
      hasPickup
    ) {
      return {
        lat: pickupLat!,
        lng: pickupLng!,
        label: "J",
        color: "#10b981",
      };
    }
    return {
      lat: deliveryLat,
      lng: deliveryLng,
      label: isRide ? "T" : "C",
      color: "#22d3ee",
    };
  }, [
    hasDriver,
    isRide,
    orderStatus,
    hasPickup,
    pickupLat,
    pickupLng,
    deliveryLat,
    deliveryLng,
  ]);

  const routeFrom = hasDriver
    ? { lat: driverLat!, lng: driverLng! }
    : null;
  const routeTo = driverNavTarget
    ? { lat: driverNavTarget.lat, lng: driverNavTarget.lng }
    : null;

  const navRouteLine = useRoadRoute(
    Boolean(routeFrom && routeTo),
    routeFrom,
    routeTo,
    fetchCustomerRoadRoute
  );

  const staticRideLine: [number, number][] | undefined =
    isRide && hasPickup && !hasDriver
      ? [
          [pickupLat!, pickupLng!],
          [deliveryLat, deliveryLng],
        ]
      : undefined;

  const fitPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = [[deliveryLat, deliveryLng]];
    if (hasPickup) pts.push([pickupLat!, pickupLng!]);
    if (hasDriver) pts.push([driverLat!, driverLng!]);
    if (navRouteLine) {
      for (const p of navRouteLine) pts.push(p);
    }
    return pts;
  }, [
    deliveryLat,
    deliveryLng,
    pickupLat,
    pickupLng,
    driverLat,
    driverLng,
    hasDriver,
    hasPickup,
    navRouteLine,
  ]);

  const center: [number, number] = hasDriver
    ? [driverLat!, driverLng!]
    : hasPickup
      ? [(pickupLat! + deliveryLat) / 2, (pickupLng! + deliveryLng) / 2]
      : [deliveryLat, deliveryLng];

  const activeRoute = navRouteLine ?? staticRideLine;
  const navActive = Boolean(navRouteLine && hasDriver);

  return (
    <div className="customer-map-wrap relative z-10 isolate">
      <MapContainer
        center={center}
        zoom={15}
        maxZoom={19}
        scrollWheelZoom
        touchZoom
        className={`z-0 rounded-none ${className}`}
        style={{ minHeight: 300 }}
      >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <MapFitBounds points={fitPoints} maxZoom={navActive ? 17 : 16} padding={56} />
      {hasPickup && (
        <Marker position={[pickupLat!, pickupLng!]} icon={ngojekPickupIcon()} />
      )}
      <Marker position={[deliveryLat, deliveryLng]} icon={customerPickupIcon()} />
      {hasDriver && (
        <Marker position={[driverLat!, driverLng!]} icon={driverMotorcycleIcon()} />
      )}
      {hasDriver && driverNavTarget && navActive && (
        <Marker
          position={[driverNavTarget.lat, driverNavTarget.lng]}
          icon={navTargetIcon(driverNavTarget.label, driverNavTarget.color)}
        />
      )}
      {activeRoute && activeRoute.length >= 2 && (
        <Polyline
          positions={activeRoute}
          pathOptions={{
            color: navActive ? "#38bdf8" : "#34d399",
            weight: navActive ? 5 : 4,
            dashArray: navActive ? undefined : "8 10",
          }}
        />
      )}
    </MapContainer>
    </div>
  );
}
