"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { DELIVERY_RADIUS_KM, haversineKm } from "@/lib/geo-config";
import { MapHtmlPins, MIN_PIN_SEPARATION_KM } from "@/components/maps/ride-map-html-pins";

export type BookingStep = "PICKUP" | "DESTINATION" | "CONFIRM";

const STEP_RING: Record<BookingStep, string> = {
  PICKUP: "ring-emerald-500/30",
  DESTINATION: "ring-sky-500/30",
  CONFIRM: "ring-slate-300",
};

const STEP_PIN: Record<Exclude<BookingStep, "CONFIRM">, { fill: string; shadow: string; glow: string }> = {
  PICKUP: {
    fill: "#10b981",
    shadow: "shadow-emerald-500/30",
    glow: "bg-emerald-400/60",
  },
  DESTINATION: {
    fill: "#0ea5e9",
    shadow: "shadow-sky-500/30",
    glow: "bg-sky-400/60",
  },
};

const suppressIdleRef = { current: false };

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
    suppressIdleRef.current = true;
    map.panTo([lat, lng], { animate: true, duration: 0.35 });
    const t = setTimeout(() => {
      suppressIdleRef.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [trigger, lat, lng, map]);

  return null;
}

/** Transisi visual antar step: pan / fitBounds. */
function MapStepTransition({
  bookingStep,
  centerLat,
  centerLng,
  pickupLat,
  pickupLng,
  destLat,
  destLng,
}: {
  bookingStep: BookingStep;
  centerLat: number;
  centerLng: number;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
}) {
  const map = useMap();
  const prevStep = useRef(bookingStep);

  useEffect(() => {
    if (prevStep.current === bookingStep) return;
    prevStep.current = bookingStep;
    suppressIdleRef.current = true;

    const separated =
      haversineKm(pickupLat, pickupLng, destLat, destLng) >= MIN_PIN_SEPARATION_KM;
    const bounds = L.latLngBounds([pickupLat, pickupLng], [destLat, destLng]);

    if (bookingStep === "CONFIRM" && separated) {
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15, animate: true });
    } else if (bookingStep === "DESTINATION" && separated) {
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 16, animate: true });
    } else {
      map.panTo([centerLat, centerLng], { animate: true, duration: 0.35 });
    }

    const t = setTimeout(() => {
      suppressIdleRef.current = false;
    }, 650);
    return () => clearTimeout(t);
  }, [
    bookingStep,
    centerLat,
    centerLng,
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    map,
  ]);

  return null;
}

function MapCenterIdle({
  enabled,
  onCenterIdle,
}: {
  enabled: boolean;
  onCenterIdle: (lat: number, lng: number) => void;
}) {
  const cbRef = useRef(onCenterIdle);
  cbRef.current = onCenterIdle;

  useMapEvents({
    moveend(e) {
      if (!enabled || suppressIdleRef.current) return;
      const c = e.target.getCenter();
      cbRef.current(c.lat, c.lng);
    },
  });

  return null;
}

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

export type RideMapInnerProps = {
  bookingStep: BookingStep;
  centerLat: number;
  centerLng: number;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  destPinLabel?: string;
  pickupLocked?: boolean;
  destLocked?: boolean;
  hubLat?: number;
  hubLng?: number;
  showRadius?: boolean;
  panTrigger?: number;
  onMapIdle: (lat: number, lng: number) => void;
  height?: number;
};

/**
 * Satu peta ride — step PICKUP / DESTINATION (pin tengah) / CONFIRM (dua pin + fitBounds).
 */
export function RideMapInner({
  bookingStep,
  centerLat,
  centerLng,
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  destPinLabel = "Tujuan",
  pickupLocked = false,
  destLocked = false,
  hubLat,
  hubLng,
  showRadius = false,
  panTrigger = 0,
  onMapIdle,
  height = 240,
}: RideMapInnerProps) {
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const isConfirm = bookingStep === "CONFIRM";
  const editStep = bookingStep === "CONFIRM" ? null : bookingStep;
  const pin = editStep ? STEP_PIN[editStep] : null;

  const handleIdle = useCallback(
    (lat: number, lng: number) => {
      if (!isConfirm) onMapIdle(lat, lng);
    },
    [isConfirm, onMapIdle]
  );

  const showRoute =
    (pickupLocked || isConfirm) &&
    haversineKm(pickupLat, pickupLng, destLat, destLng) >= MIN_PIN_SEPARATION_KM;

  return (
    <div
      ref={setOverlayEl}
      className={`customer-ride-map relative overflow-hidden rounded-2xl ring-1 ${STEP_RING[bookingStep]}`}
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
        <MapCenterIdle enabled={!isConfirm} onCenterIdle={handleIdle} />
        <MapPanTo lat={centerLat} lng={centerLng} trigger={panTrigger} />
        <MapStepTransition
          bookingStep={bookingStep}
          centerLat={centerLat}
          centerLng={centerLng}
          pickupLat={pickupLat}
          pickupLng={pickupLng}
          destLat={destLat}
          destLng={destLng}
        />
        {showRoute && (
          <Polyline
            positions={[
              [pickupLat, pickupLng],
              [destLat, destLng],
            ]}
            pathOptions={{
              color: "#64748b",
              weight: 3,
              opacity: 0.75,
              dashArray: "7 7",
            }}
          />
        )}
        {overlayEl && (
          <MapHtmlPins
            overlayEl={overlayEl}
            bookingStep={bookingStep}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            destLat={destLat}
            destLng={destLng}
            destPinLabel={destPinLabel}
            pickupLocked={pickupLocked}
            destLocked={destLocked}
          />
        )}
        {showRadius && hubLat != null && hubLng != null && (
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

      {pin && (
        <div
          className="pointer-events-none absolute inset-0 z-[8] flex items-center justify-center"
          aria-hidden
        >
          <div className="-mt-8 flex flex-col items-center">
            <div
              className={`rounded-full p-1 shadow-lg ${pin.shadow}`}
              style={{ backgroundColor: `${pin.fill}33` }}
            >
              <svg
                width="36"
                height="48"
                viewBox="0 0 24 36"
                className="drop-shadow-lg"
              >
                <path
                  d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
                  fill={pin.fill}
                />
                <circle cx="12" cy="12" r="5" fill="#f8fafc" />
              </svg>
            </div>
            <span
              className="mt-1 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold shadow-sm"
              style={{ color: pin.fill }}
            >
              {bookingStep === "PICKUP" ? "Jemput" : destPinLabel}
            </span>
            <div className={`mt-1 h-2 w-2 rounded-full blur-[1px] ${pin.glow}`} />
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated Gunakan BookingStep */
export type RideMapMode = "pickup" | "destination";
