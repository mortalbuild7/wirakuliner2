"use client";

import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import L from "leaflet";

const merchantIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-lg">T</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const customerIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-xs font-bold text-slate-950 shadow-lg">C</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const driverIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg ring-2 ring-emerald-300">D</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function DriverRouteMapInner({
  merchantLat,
  merchantLng,
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
}: {
  merchantLat: number;
  merchantLng: number;
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}) {
  const centerLat = (merchantLat + deliveryLat) / 2;
  const centerLng = (merchantLng + deliveryLng) / 2;
  const line: [number, number][] = [
    [merchantLat, merchantLng],
    [deliveryLat, deliveryLng],
  ];

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={14}
      scrollWheelZoom={false}
      className="h-48 w-full rounded-2xl z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[merchantLat, merchantLng]} icon={merchantIcon} />
      <Marker position={[deliveryLat, deliveryLng]} icon={customerIcon} />
      {driverLat != null && driverLng != null && (
        <Marker position={[driverLat, driverLng]} icon={driverIcon} />
      )}
      <Polyline positions={line} pathOptions={{ color: "#34d399", weight: 3, dashArray: "6 8" }} />
    </MapContainer>
  );
}
