"use client";

import { useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
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

function DraggableUserPin({
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
      icon={userMarkerIcon()}
      ref={markerRef}
      eventHandlers={eventHandlers}
    />
  );
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
  const interactionsLocked = followGps && lockZoom;
  const bearing = navActive
    ? bearingDegrees(userLat, userLng, navigationTarget.lat, navigationTarget.lng)
    : undefined;
  const activeRoute: [number, number][] | undefined = navActive
    ? navigationRouteLine && navigationRouteLine.length >= 2
      ? navigationRouteLine
      : [userPos, [navigationTarget.lat, navigationTarget.lng]]
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
        maxZoom={GPS_LOCK_ZOOM}
        scrollWheelZoom={!interactionsLocked}
        doubleClickZoom={!interactionsLocked}
        touchZoom={!interactionsLocked}
        boxZoom={!interactionsLocked}
        keyboard={!interactionsLocked}
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
          follow={followGps}
          lockZoom={lockZoom}
        />
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
          <DraggableUserPin position={userPos} onDragEnd={onUserDrag} />
        ) : (
          <Marker position={userPos} icon={driverIcon} />
        )}
      </MapContainer>
    </div>
  );
}
