"use client";

import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { DELIVERY_RADIUS_KM, JALAN_WIRA } from "@/lib/geo-config";

const hubIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-lg ring-2 ring-orange-300">W</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 text-white shadow-lg ring-4 ring-cyan-400/40 animate-pulse-glow">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function DraggablePin({
  position,
  onDragEnd,
}: {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) {
          const { lat, lng } = m.getLatLng();
          onDragEnd(lat, lng);
        }
      },
    }),
    [onDragEnd]
  );

  return (
    <Marker
      draggable
      position={position}
      icon={userIcon}
      ref={markerRef}
      eventHandlers={eventHandlers}
    />
  );
}

export function LocationMapInner({
  latitude,
  longitude,
  onLocationChange,
  height = 220,
}: {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const hub: [number, number] = [JALAN_WIRA.latitude, JALAN_WIRA.longitude];
  const userPos: [number, number] = [latitude, longitude];
  const radiusM = DELIVERY_RADIUS_KM * 1000;

  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl ring-1 ring-cyan-500/30">
      <MapContainer
        center={userPos}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter lat={latitude} lng={longitude} />
        <Circle
          center={hub}
          radius={radiusM}
          pathOptions={{
            color: "#22d3ee",
            fillColor: "#22d3ee",
            fillOpacity: 0.12,
            weight: 2,
            dashArray: "6 8",
          }}
        />
        <Marker position={hub} icon={hubIcon} />
        <DraggablePin position={userPos} onDragEnd={onLocationChange} />
      </MapContainer>
    </div>
  );
}
