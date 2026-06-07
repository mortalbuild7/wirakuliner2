"use client";

import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { DELIVERY_RADIUS_KM } from "@/lib/geo-config";
import { GPS_LOCK_ZOOM } from "@/lib/map-location";
import { bearingDegrees, DRIVER_NAV_ZOOM } from "@/lib/map-navigation";
import { MapGpsFollow } from "@/components/maps/map-gps-follow";

const hubIcon = (label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:9999px;background:#f97316;color:#fff;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.35);border:2px solid #fdba74">${label.slice(0, 1).toUpperCase()}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

function userMarkerIcon(bearingDeg?: number) {
  const rotation = bearingDeg != null ? `transform:rotate(${bearingDeg}deg);` : "";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;height:44px;width:44px;align-items:center;justify-content:center;${rotation}">
      <div style="display:flex;height:40px;width:40px;align-items:center;justify-content:center;border-radius:9999px;background:#22d3ee;color:#fff;box-shadow:0 4px 16px rgba(34,211,238,.5);border:3px solid rgba(34,211,238,.6)">
        ${
          bearingDeg != null
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 18-3-5-3 5 3-18z"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`
        }
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const pointIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

function emitPinPosition(
  markerRef: { current: L.Marker | null },
  onMove: (lat: number, lng: number) => void
) {
  const m = markerRef.current;
  if (!m) return;
  const { lat, lng } = m.getLatLng();
  onMove(lat, lng);
}

function DraggableUserPin({
  position,
  onMove,
}: {
  position: [number, number];
  onMove: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(
    () => ({
      drag() {
        emitPinPosition(markerRef, onMove);
      },
      dragend() {
        emitPinPosition(markerRef, onMove);
      },
    }),
    [onMove]
  );

  return (
    <Marker
      draggable
      position={position}
      icon={userMarkerIcon()}
      ref={markerRef}
      eventHandlers={eventHandlers}
      zIndexOffset={1000}
    />
  );
}

/** Ketuk peta untuk menempatkan pin (mode pilih alamat manual). */
function MapTapPlacePin({
  enabled,
  onPlace,
}: {
  enabled: boolean;
  onPlace: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    function onClick(e: L.LeafletMouseEvent) {
      onPlace(e.latlng.lat, e.latlng.lng);
    }
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [enabled, map, onPlace]);

  return null;
}

/** Zoom out agar area sekitar toko terlihat saat pilih alamat orang lain. */
function MapManualPickView({
  hubLat,
  hubLng,
  active,
}: {
  hubLat: number;
  hubLng: number;
  active: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!active) return;
    map.setMinZoom(12);
    map.setMaxZoom(19);
    map.setView([hubLat, hubLng], 15, { animate: false });
  }, [active, hubLat, hubLng, map]);

  return null;
}

export type GpsLockMapPoint = {
  lat: number;
  lng: number;
  label: string;
  color: string;
};

export function GpsLockMapInner({
  userLat,
  userLng,
  userAccuracyM,
  hubLat,
  hubLng,
  hubLabel = "W",
  showRadius = true,
  followGps = true,
  lockZoom = true,
  manualPickMode = false,
  draggableUser = false,
  onUserDrag,
  extraPoints = [],
  routeLine,
  navigationRouteLine,
  navigationTarget,
  navigationTargetLabel = "C",
  navigationTargetColor = "#22d3ee",
  height,
  className = "h-full w-full",
}: {
  userLat: number;
  userLng: number;
  userAccuracyM?: number | null;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  showRadius?: boolean;
  followGps?: boolean;
  lockZoom?: boolean;
  /** Mode pilih titik antar manual: ketuk peta + geser pin, zoom bebas. */
  manualPickMode?: boolean;
  draggableUser?: boolean;
  onUserDrag?: (lat: number, lng: number) => void;
  extraPoints?: GpsLockMapPoint[];
  routeLine?: [number, number][];
  navigationRouteLine?: [number, number][];
  navigationTarget?: { lat: number; lng: number } | null;
  navigationTargetLabel?: string;
  navigationTargetColor?: string;
  height?: number | null;
  className?: string;
}) {
  const userPos: [number, number] = [userLat, userLng];
  const hubPos: [number, number] = [hubLat, hubLng];
  const radiusM = DELIVERY_RADIUS_KM * 1000;
  const navActive = navigationTarget != null;
  const zoom = navActive ? DRIVER_NAV_ZOOM : GPS_LOCK_ZOOM;
  const interactionsLocked = !manualPickMode && followGps && lockZoom;
  const mapMaxZoom = manualPickMode ? 19 : GPS_LOCK_ZOOM;
  const bearing = navActive
    ? bearingDegrees(userLat, userLng, navigationTarget.lat, navigationTarget.lng)
    : undefined;
  const activeRoute: [number, number][] | undefined = navActive
    ? navigationRouteLine && navigationRouteLine.length >= 2
      ? navigationRouteLine
      : undefined
    : routeLine;
  const driverIcon = userMarkerIcon(bearing);

  const wrapStyle = height != null ? { height } : undefined;

  return (
    <div
      style={wrapStyle}
      className={`overflow-hidden ring-1 ring-cyan-500/30 ${height == null ? "h-full min-h-[240px]" : "rounded-2xl"}`}
    >
      <MapContainer
        center={userPos}
        zoom={zoom}
        maxZoom={mapMaxZoom}
        scrollWheelZoom={manualPickMode || !interactionsLocked}
        doubleClickZoom={manualPickMode || !interactionsLocked}
        touchZoom={manualPickMode || !interactionsLocked}
        boxZoom={manualPickMode || !interactionsLocked}
        keyboard={manualPickMode || !interactionsLocked}
        className={className}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapGpsFollow
          lat={userLat}
          lng={userLng}
          zoom={zoom}
          follow={followGps && !manualPickMode}
          lockZoom={lockZoom && !manualPickMode}
        />
        {manualPickMode && (
          <MapManualPickView hubLat={hubLat} hubLng={hubLng} active={manualPickMode} />
        )}
        {manualPickMode && onUserDrag && (
          <MapTapPlacePin enabled={manualPickMode} onPlace={onUserDrag} />
        )}
        {showRadius && !navActive && (
          <Circle
            center={hubPos}
            radius={radiusM}
            pathOptions={{
              color: "#22d3ee",
              fillColor: "#22d3ee",
              fillOpacity: 0.1,
              weight: 2,
              dashArray: "6 8",
            }}
          />
        )}
        {!navActive && <Marker position={hubPos} icon={hubIcon(hubLabel)} />}
        {userAccuracyM != null && userAccuracyM > 0 && (
          <Circle
            center={userPos}
            radius={userAccuracyM}
            pathOptions={{
              color: "#22d3ee",
              fillColor: "#06b6d4",
              fillOpacity: 0.2,
              weight: 1,
            }}
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
        {navActive && (
          <Marker
            position={[navigationTarget.lat, navigationTarget.lng]}
            icon={pointIcon(navigationTargetColor, navigationTargetLabel)}
          />
        )}
        {extraPoints.map((p) => (
          <Marker
            key={`${p.label}-${p.lat}-${p.lng}`}
            position={[p.lat, p.lng]}
            icon={pointIcon(p.color, p.label)}
          />
        ))}
        {draggableUser && onUserDrag ? (
          <DraggableUserPin position={userPos} onMove={onUserDrag} />
        ) : (
          <Marker position={userPos} icon={driverIcon} />
        )}
      </MapContainer>
    </div>
  );
}
