"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMap, useMapEvents } from "react-leaflet";
import { haversineKm } from "@/lib/geo-config";
import type { BookingStep } from "@/components/maps/ride-map-inner";

const MIN_PIN_SEPARATION_KM = 0.005;

type MapPoint = { x: number; y: number };

function HtmlMapPin({
  x,
  y,
  fill,
  label,
  locked = false,
}: {
  x: number;
  y: number;
  fill: string;
  label: string;
  locked?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -100%)",
        zIndex: 6,
      }}
    >
      <div className="flex flex-col items-center drop-shadow-md">
        <svg width="28" height="36" viewBox="0 0 24 36" aria-hidden="true">
          <path
            d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
            fill={fill}
          />
          <circle cx="12" cy="12" r="4.5" fill="#f8fafc" />
        </svg>
        <span
          className="mt-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm"
          style={{ color: fill }}
        >
          {locked ? `${label} · kunci` : label}
        </span>
      </div>
    </div>
  );
}

function MapHtmlPins({
  overlayEl,
  bookingStep,
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  destPinLabel,
  pickupLocked = false,
  destLocked = false,
}: {
  overlayEl: HTMLDivElement;
  bookingStep: BookingStep;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  destPinLabel: string;
  pickupLocked?: boolean;
  destLocked?: boolean;
}) {
  const map = useMap();
  const [pins, setPins] = useState<{ pickup: MapPoint; dest: MapPoint } | null>(
    null
  );

  const refresh = useCallback(() => {
    const pickup = map.latLngToContainerPoint([pickupLat, pickupLng]);
    const dest = map.latLngToContainerPoint([destLat, destLng]);
    setPins({ pickup: { x: pickup.x, y: pickup.y }, dest: { x: dest.x, y: dest.y } });
  }, [map, pickupLat, pickupLng, destLat, destLng]);

  useMapEvents({
    move: refresh,
    zoom: refresh,
    moveend: refresh,
    zoomend: refresh,
    resize: refresh,
  });

  useEffect(() => {
    refresh();
    map.whenReady(refresh);
  }, [map, refresh]);

  if (!pins) return null;

  const separated =
    haversineKm(pickupLat, pickupLng, destLat, destLng) >= MIN_PIN_SEPARATION_KM;

  const showPickupPin =
    separated &&
    (bookingStep === "CONFIRM" ||
      (bookingStep === "DESTINATION" && pickupLocked));
  const showDestPin =
    separated &&
    (bookingStep === "CONFIRM" ||
      (bookingStep === "DESTINATION" && destLocked));

  return createPortal(
    <>
      {showPickupPin && (
        <HtmlMapPin
          x={pins.pickup.x}
          y={pins.pickup.y}
          fill="#10b981"
          label="Jemput"
          locked={pickupLocked || bookingStep === "CONFIRM"}
        />
      )}
      {showDestPin && (
        <HtmlMapPin
          x={pins.dest.x}
          y={pins.dest.y}
          fill="#0ea5e9"
          label={destPinLabel}
          locked={destLocked || bookingStep === "CONFIRM"}
        />
      )}
    </>,
    overlayEl
  );
}

export { MapHtmlPins, MIN_PIN_SEPARATION_KM };
