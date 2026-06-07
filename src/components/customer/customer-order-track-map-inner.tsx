"use client";

import { useMemo } from "react";
import { GpsLockMapInner } from "@/components/maps/gps-lock-map-inner";
import { MapFitBounds } from "@/components/maps/map-fit-bounds";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import { customerPickupIcon, driverMotorcycleIcon } from "@/lib/map-marker-icons";

/** Peta lacak pesanan: titik tujuan + posisi driver (motor), auto-fit bounds. */
export function CustomerOrderTrackMapInner({
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
  className = "h-[300px] w-full",
}: {
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
  className?: string;
}) {
  const hasDriver = driverLat != null && driverLng != null;

  const fitPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = [[deliveryLat, deliveryLng]];
    if (hasDriver) pts.push([driverLat!, driverLng!]);
    return pts;
  }, [deliveryLat, deliveryLng, driverLat, driverLng, hasDriver]);

  const routeLine: [number, number][] | undefined = hasDriver
    ? [
        [driverLat!, driverLng!],
        [deliveryLat, deliveryLng],
      ]
    : undefined;

  const center: [number, number] = hasDriver
    ? [(driverLat! + deliveryLat) / 2, (driverLng! + deliveryLng) / 2]
    : [deliveryLat, deliveryLng];

  if (!hasDriver) {
    return (
      <GpsLockMapInner
        userLat={deliveryLat}
        userLng={deliveryLng}
        hubLat={deliveryLat}
        hubLng={deliveryLng}
        hubLabel="T"
        showRadius={false}
        showHubMarker={false}
        followGps={false}
        lockZoom={false}
        userMarkerKind="customer"
        className={className}
      />
    );
  }

  return (
    <div
      className={`overflow-hidden ring-1 ring-cyan-500/30 ${className.includes("h-") ? "" : "min-h-[300px]"} ${className}`}
    >
      <MapContainer
        center={center}
        zoom={15}
        maxZoom={19}
        scrollWheelZoom
        touchZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%", minHeight: 300 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapFitBounds points={fitPoints} maxZoom={17} padding={56} />
        {routeLine && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#34d399", weight: 4, dashArray: "8 10" }}
          />
        )}
        <Marker position={[deliveryLat, deliveryLng]} icon={customerPickupIcon()} />
        <Marker position={[driverLat!, driverLng!]} icon={driverMotorcycleIcon()} />
      </MapContainer>
    </div>
  );
}
