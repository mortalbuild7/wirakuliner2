"use client";

import { useCallback, useEffect, useRef } from "react";
import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { DELIVERY_RADIUS_KM } from "@/lib/geo-config";

/**
 * Pan peta ke koordinat baru tanpa re-mount (60fps-friendly).
 * Dipicu oleh panTrigger dari Zustand saat user memilih alamat di search bar.
 */
function MapPanTo({
  lat,
  lng,
  trigger,
}: {
  lat: number;
  lng: number;
  trigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (trigger <= 0) return;
    map.panTo([lat, lng], { animate: true, duration: 0.35 });
  }, [trigger, lat, lng, map]);

  return null;
}

/**
 * Tangkap koordinat pusat peta saat geser selesai — setara onCameraIdle / onMoveEnd.
 * Pin visual tetap di tengah; yang berubah adalah center peta Leaflet.
 */
function MapCenterIdle({
  onCenterIdle,
}: {
  onCenterIdle: (lat: number, lng: number) => void;
}) {
  const cbRef = useRef(onCenterIdle);
  cbRef.current = onCenterIdle;

  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      cbRef.current(c.lat, c.lng);
    },
  });

  return null;
}

/** Set view awal peta sekali saat mount — emit koordinat awal ke parent. */
function MapInitView({
  lat,
  lng,
  zoom,
  onReady,
}: {
  lat: number;
  lng: number;
  zoom: number;
  onReady?: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const done = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    map.setView([lat, lng], zoom, { animate: false });
    const c = map.getCenter();
    onReadyRef.current?.(c.lat, c.lng);
  }, [lat, lng, zoom, map]);

  return null;
}

/**
 * Implementasi Leaflet peta jemput — center-pinned marker emerald.
 * Parent (useNgojekRide) menerima onMapIdle → getAddressFromCoordinates.
 */
export function PickupMapInner({
  centerLat,
  centerLng,
  hubLat,
  hubLng,
  hubLabel = "W",
  showRadius = false,
  panTrigger = 0,
  onMapIdle,
  height = 240,
}: {
  centerLat: number;
  centerLng: number;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  showRadius?: boolean;
  panTrigger?: number;
  onMapIdle: (lat: number, lng: number) => void;
  height?: number;
}) {
  const handleIdle = useCallback(
    (lat: number, lng: number) => {
      onMapIdle(lat, lng);
    },
    [onMapIdle]
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl ring-1 ring-emerald-500/30"
      style={{ height }}
    >
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={15}
        maxZoom={19}
        scrollWheelZoom
        doubleClickZoom
        touchZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapInitView lat={centerLat} lng={centerLng} zoom={15} onReady={handleIdle} />
        <MapCenterIdle onCenterIdle={handleIdle} />
        <MapPanTo lat={centerLat} lng={centerLng} trigger={panTrigger} />
        {showRadius && (
          <Circle
            center={[hubLat, hubLng]}
            radius={DELIVERY_RADIUS_KM * 1000}
            pathOptions={{
              color: "#22d3ee",
              fillColor: "#22d3ee",
              fillOpacity: 0.08,
              weight: 2,
              dashArray: "6 8",
            }}
          />
        )}
      </MapContainer>

      {/* Center-pinned marker — peta bergerak, pin tetap di tengah layar */}
      <div
        className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center"
        aria-hidden
      >
        <div className="-mt-8 flex flex-col items-center">
          <div className="rounded-full bg-emerald-500/20 p-1 shadow-lg shadow-emerald-500/30">
            <svg
              width="36"
              height="48"
              viewBox="0 0 24 36"
              className="drop-shadow-lg"
            >
              <path
                d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
                fill="#10b981"
              />
              <circle cx="12" cy="12" r="5" fill="#ecfdf5" />
            </svg>
          </div>
          <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400/60 blur-[1px]" />
        </div>
      </div>
    </div>
  );
}
