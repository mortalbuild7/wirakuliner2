"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DELIVERY_RADIUS_KM,
  FLAT_DELIVERY_FEE_IDR,
  type ZoneCenter,
} from "@/lib/geo-config";
import { useMapLocation } from "@/hooks/use-map-location";
import { formatIdr } from "@/lib/utils";

const LocationMapInner = dynamic(
  () => import("./location-map-inner").then((m) => m.LocationMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[260px] items-center justify-center rounded-2xl bg-slate-800/80 text-sm text-cyan-300/80">
        Memuat peta GPS realtime...
      </div>
    ),
  }
);

export function LocationPicker({
  latitude,
  longitude,
  onChange,
  distanceKm,
  withinRadius,
  accuracyM,
  zoneCenter,
}: {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number, accuracyM?: number) => void;
  distanceKm: number;
  withinRadius: boolean;
  accuracyM?: number | null;
  zoneCenter: ZoneCenter;
}) {
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualPin, setManualPin] = useState(false);

  const { fix, loading: gpsLoading, zoomLocked, bestAccuracy } = useMapLocation(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!fix || manualPin) return;
    onChangeRef.current(fix.lat, fix.lng, bestAccuracy ?? fix.accuracy);
    setGpsError(null);
  }, [fix, manualPin, bestAccuracy]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGpsError("GPS tidak didukung di perangkat ini");
      return;
    }
    setManualPin(false);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? "Izinkan akses lokasi di pengaturan browser / HP"
            : "Gagal mengambil GPS. Geser pin di peta."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function handlePinDrag(lat: number, lng: number) {
    setManualPin(true);
    onChange(lat, lng);
  }

  const displayAccuracy = manualPin
    ? accuracyM
    : (bestAccuracy ?? fix?.accuracy ?? accuracyM);

  const followGps = !manualPin && fix != null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <Radar className="h-4 w-4" />
          GPS realtime · radius {DELIVERY_RADIUS_KM} km
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
          onClick={useMyLocation}
          disabled={gpsLoading}
        >
          <Crosshair className="mr-1 h-3.5 w-3.5" />
          {gpsLoading ? "GPS..." : "Lokasi saya"}
        </Button>
      </div>

      <LocationMapInner
        latitude={latitude}
        longitude={longitude}
        onLocationChange={handlePinDrag}
        accuracyM={displayAccuracy}
        hubLat={zoneCenter.lat}
        hubLng={zoneCenter.lng}
        hubLabel={zoneCenter.name.slice(0, 1)}
        followGps={followGps}
        lockZoom={followGps && zoomLocked}
        height={280}
      />

      <p className="text-center text-[11px] text-muted-foreground">
        {followGps && zoomLocked
          ? "Zoom dikunci · mengikuti GPS realtime"
          : "Geser pin biru untuk koreksi manual"}{" "}
        · titik oranye = {zoneCenter.name}
      </p>

      {gpsError && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{gpsError}</p>
      )}

      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 ${
          withinRadius
            ? "border border-cyan-500/40 bg-cyan-500/10 glow-ring"
            : "border border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <MapPin className={`h-5 w-5 ${withinRadius ? "text-cyan-400" : "text-amber-400"}`} />
          <div>
            <p className="text-xs text-muted-foreground">Jarak ke {zoneCenter.name}</p>
            <p className="text-lg font-bold tabular-nums">{distanceKm.toFixed(2)} km</p>
            {displayAccuracy != null && displayAccuracy > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Akurasi GPS ±{Math.round(displayAccuracy)} m
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          {withinRadius ? (
            <>
              <p className="text-xs text-cyan-300/80">Dalam radius</p>
              <p className="font-semibold text-cyan-300">{formatIdr(FLAT_DELIVERY_FEE_IDR)}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-amber-300/80">Luar radius</p>
              <p className="text-sm font-medium text-amber-200">Nego driver</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
