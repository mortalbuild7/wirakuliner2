"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Crosshair, MapPin, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DELIVERY_RADIUS_KM,
  FLAT_DELIVERY_FEE_IDR,
  JALAN_WIRA,
} from "@/lib/geo-config";
import { formatIdr } from "@/lib/utils";

const LocationMapInner = dynamic(
  () => import("./location-map-inner").then((m) => m.LocationMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center rounded-2xl bg-slate-800/80 text-sm text-cyan-300/80">
        Memuat peta GPS...
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
}: {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
  distanceKm: number;
  withinRadius: boolean;
}) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGpsError("GPS tidak didukung di perangkat ini");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? "Izinkan akses lokasi di pengaturan browser / HP"
            : "Gagal mengambil GPS. Geser pin di peta."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <Radar className="h-4 w-4" />
          Pelacak lokasi · radius {DELIVERY_RADIUS_KM} km
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
        onLocationChange={onChange}
        height={240}
      />

      <p className="text-center text-[11px] text-muted-foreground">
        Geser pin biru atau tap &quot;Lokasi saya&quot; · titik <span className="text-orange-400">W</span> = {JALAN_WIRA.name}
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
            <p className="text-xs text-muted-foreground">Jarak ke {JALAN_WIRA.name}</p>
            <p className="text-lg font-bold tabular-nums">{distanceKm.toFixed(2)} km</p>
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
