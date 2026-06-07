"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import { MapFitBounds } from "@/components/maps/map-fit-bounds";
import {
  customerPickupIcon,
  driverMotorcycleIcon,
  ngojekPickupIcon,
} from "@/lib/map-marker-icons";

const MAP_HEIGHT = "h-[300px]";

/** Peta lacak pesanan: titik tujuan + posisi driver (motor). */
export function CustomerOrderTrackMapInner({
  deliveryLat,
  deliveryLng,
  pickupLat,
  pickupLng,
  driverLat,
  driverLng,
  className = `${MAP_HEIGHT} w-full`,
}: {
  deliveryLat: number;
  deliveryLng: number;
  pickupLat?: number | null;
  pickupLng?: number | null;
  driverLat?: number | null;
  driverLng?: number | null;
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

  const fitPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = [[deliveryLat, deliveryLng]];
    if (hasPickup) pts.push([pickupLat!, pickupLng!]);
    if (hasDriver) pts.push([driverLat!, driverLng!]);
    return pts;
  }, [deliveryLat, deliveryLng, pickupLat, pickupLng, driverLat, driverLng, hasDriver, hasPickup]);

  const center: [number, number] = hasDriver
    ? [(driverLat! + deliveryLat) / 2, (driverLng! + deliveryLng) / 2]
    : [deliveryLat, deliveryLng];

  const routeLine: [number, number][] | undefined = hasDriver
    ? [
        [driverLat!, driverLng!],
        [deliveryLat, deliveryLng],
      ]
    : undefined;

  return (
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
      <MapFitBounds points={fitPoints} maxZoom={17} padding={56} />
      {hasPickup && (
        <Marker position={[pickupLat!, pickupLng!]} icon={ngojekPickupIcon()} />
      )}
      <Marker position={[deliveryLat, deliveryLng]} icon={customerPickupIcon()} />
      {hasDriver && (
        <Marker position={[driverLat!, driverLng!]} icon={driverMotorcycleIcon()} />
      )}
      {routeLine && (
        <Polyline
          positions={routeLine}
          pathOptions={{ color: "#34d399", weight: 4, dashArray: "8 10" }}
        />
      )}
    </MapContainer>
  );
}
