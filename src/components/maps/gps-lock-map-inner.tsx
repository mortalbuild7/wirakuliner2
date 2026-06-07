"use client";

import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { DELIVERY_RADIUS_KM } from "@/lib/geo-config";
import { GPS_LOCK_ZOOM } from "@/lib/map-location";
import { bearingDegrees, DRIVER_NAV_ZOOM } from "@/lib/map-navigation";
import { customerPickupIcon, driverMotorcycleIcon } from "@/lib/map-marker-icons";
import { MapGpsFollow } from "@/components/maps/map-gps-follow";

const hubIcon = (label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:9999px;background:#f97316;color:#fff;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.35);border:2px solid #fdba74">${label.slice(0, 1).toUpperCase()}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const pointIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;height:32px;width:32px;align-items:center;justify-content:center;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const PICKUP_PIN_ICON = customerPickupIcon();

function emitPinPosition(
  markerRef: { current: L.Marker | null },
  onMove: (lat: number, lng: number) => void
) {
  const m = markerRef.current;
  if (!m) return;
  const { lat, lng } = m.getLatLng();
  onMove(lat, lng);
}

/**
 * Pin draggable — update parent hanya di dragend agar tidak re-render saat diseret.
 */
function DraggableUserPin({
  position,
  onMoveEnd,
  onMovePreview,
}: {
  position: [number, number];
  onMoveEnd: (lat: number, lng: number) => void;
  onMovePreview?: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const draggingRef = useRef(false);
  const onMoveEndRef = useRef(onMoveEnd);
  const onMovePreviewRef = useRef(onMovePreview);
  onMoveEndRef.current = onMoveEnd;
  onMovePreviewRef.current = onMovePreview;

  useEffect(() => {
    if (draggingRef.current) return;
    const m = markerRef.current;
    if (!m) return;
    const [lat, lng] = position;
    const cur = m.getLatLng();
    if (Math.abs(cur.lat - lat) < 1e-8 && Math.abs(cur.lng - lng) < 1e-8) return;
    m.setLatLng([lat, lng]);
  }, [position]);

  const eventHandlers = useMemo(
    () => ({
      dragstart() {
        draggingRef.current = true;
      },
      drag() {
        if (!onMovePreviewRef.current) return;
        emitPinPosition(markerRef, onMovePreviewRef.current);
      },
      dragend() {
        draggingRef.current = false;
        emitPinPosition(markerRef, (lat, lng) => onMoveEndRef.current(lat, lng));
      },
    }),
    []
  );

  return (
    <Marker
      draggable
      position={position}
      icon={PICKUP_PIN_ICON}
      ref={markerRef}
      eventHandlers={eventHandlers}
      zIndexOffset={1000}
      autoPan
      autoPanPadding={L.point(56, 56)}
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
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    if (!enabled) return;
    function onClick(e: L.LeafletMouseEvent) {
      onPlaceRef.current(e.latlng.lat, e.latlng.lng);
    }
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [enabled, map]);

  return null;
}

export type ManualPickCenter = "hub" | "user" | "both";

/** Atur zoom manual sekali saat mode pilih pin — jangan reset saat hub GPS berubah. */
function MapManualPickView({
  hubLat,
  hubLng,
  userLat,
  userLng,
  active,
  centerMode = "hub",
}: {
  hubLat: number;
  hubLng: number;
  userLat: number;
  userLng: number;
  active: boolean;
  centerMode?: ManualPickCenter;
}) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    map.setMinZoom(12);
    map.setMaxZoom(19);

    if (centerMode === "user") {
      map.setView([userLat, userLng], 15, { animate: false });
      return;
    }
    if (centerMode === "both") {
      const bounds = L.latLngBounds([hubLat, hubLng], [userLat, userLng]);
      map.fitBounds(bounds.pad(0.15), { padding: [48, 48], maxZoom: 16, animate: false });
      return;
    }
    map.setView([hubLat, hubLng], 15, { animate: false });
  }, [active, centerMode, hubLat, hubLng, userLat, userLng, map]);

  return null;
}

/** Geser peta ke pin saat koordinat berubah dari geocoding (bukan drag). */
function MapFlyToUser({
  lat,
  lng,
  trigger,
}: {
  lat: number;
  lng: number;
  trigger?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (trigger == null || trigger <= 0) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.35 });
  }, [trigger, lat, lng, map]);

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
  showHubMarker = true,
  followGps = true,
  lockZoom = true,
  manualPickMode = false,
  manualPickCenter = "hub",
  draggableUser = false,
  onUserDrag,
  onUserDragPreview,
  extraPoints = [],
  routeLine,
  navigationRouteLine,
  navigationTarget,
  navigationTargetLabel = "C",
  navigationTargetColor = "#22d3ee",
  userMarkerKind = "customer",
  flyToTrigger,
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
  showHubMarker?: boolean;
  followGps?: boolean;
  lockZoom?: boolean;
  /** Mode pilih titik antar manual: ketuk peta + geser pin, zoom bebas. */
  manualPickMode?: boolean;
  /** Pusat peta awal saat manual pick (default hub / toko). */
  manualPickCenter?: ManualPickCenter;
  draggableUser?: boolean;
  onUserDrag?: (lat: number, lng: number) => void;
  /** Preview ongkir saat drag — tidak update state parent (hindari re-render). */
  onUserDragPreview?: (lat: number, lng: number) => void;
  extraPoints?: GpsLockMapPoint[];
  routeLine?: [number, number][];
  navigationRouteLine?: [number, number][];
  navigationTarget?: { lat: number; lng: number } | null;
  navigationTargetLabel?: string;
  navigationTargetColor?: string;
  /** `driver` = ikon motor (APK driver), `customer` = pin biru checkout. */
  userMarkerKind?: "customer" | "driver";
  /** Naikkan nilai untuk flyTo pin setelah geocode. */
  flyToTrigger?: number;
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
  const userIcon =
    userMarkerKind === "driver"
      ? driverMotorcycleIcon(bearing)
      : customerPickupIcon(bearing);

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
          <MapManualPickView
            hubLat={hubLat}
            hubLng={hubLng}
            userLat={userLat}
            userLng={userLng}
            active={manualPickMode}
            centerMode={manualPickCenter}
          />
        )}
        {manualPickMode && onUserDrag && (
          <MapTapPlacePin enabled={manualPickMode} onPlace={onUserDrag} />
        )}
        {manualPickMode && flyToTrigger != null && flyToTrigger > 0 && (
          <MapFlyToUser lat={userLat} lng={userLng} trigger={flyToTrigger} />
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
        {!navActive && showHubMarker && (
          <Marker position={hubPos} icon={hubIcon(hubLabel)} />
        )}
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
          <DraggableUserPin
            position={userPos}
            onMoveEnd={onUserDrag}
            onMovePreview={onUserDragPreview}
          />
        ) : (
          <Marker position={userPos} icon={userIcon} />
        )}
      </MapContainer>
    </div>
  );
}
