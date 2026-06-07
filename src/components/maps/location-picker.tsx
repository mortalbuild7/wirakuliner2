"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Radar, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DELIVERY_RADIUS_KM, distanceToZone, type ZoneCenter } from "@/lib/geo-config";
import {
  calculateDeliveryFee,
  describeDeliveryFee,
  isTier1Distance,
} from "@/lib/delivery-fee";
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

export type DeliveryDestinationMode = "self" | "other";

export function LocationPicker({
  latitude,
  longitude,
  onChange,
  distanceKm,
  accuracyM,
  zoneCenter,
  destinationMode = "self",
}: {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number, accuracyM?: number) => void;
  distanceKm: number;
  accuracyM?: number | null;
  zoneCenter: ZoneCenter;
  destinationMode?: DeliveryDestinationMode;
}) {
  const isOtherAddress = destinationMode === "other";
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualPin, setManualPin] = useState(isOtherAddress);
  const [dragPreview, setDragPreview] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const displayDistance =
    isOtherAddress && dragPreview
      ? distanceToZone(
          dragPreview.lat,
          dragPreview.lng,
          zoneCenter.lat,
          zoneCenter.lng
        )
      : distanceKm;
  const deliveryFee = calculateDeliveryFee(displayDistance);
  const tier1 = isTier1Distance(displayDistance);

  const { fix, loading: gpsLoading, zoomLocked, bestAccuracy } = useMapLocation(
    !isOtherAddress
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setDragPreview(null);
    if (isOtherAddress) {
      setManualPin(true);
      return;
    }
    setManualPin(false);
  }, [isOtherAddress]);

  useEffect(() => {
    if (!fix || manualPin || isOtherAddress) return;
    onChangeRef.current(fix.lat, fix.lng, bestAccuracy ?? fix.accuracy);
    setGpsError(null);
  }, [fix, manualPin, bestAccuracy, isOtherAddress]);

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

  const handlePinDragEnd = useCallback((lat: number, lng: number) => {
    setManualPin(true);
    setDragPreview(null);
    onChangeRef.current(lat, lng);
  }, []);

  const handlePinDragPreview = useCallback(
    (lat: number, lng: number) => {
      if (!isOtherAddress) return;
      setDragPreview({ lat, lng });
    },
    [isOtherAddress]
  );

  const displayAccuracy = manualPin
    ? accuracyM
    : (bestAccuracy ?? fix?.accuracy ?? accuracyM);

  const followGps = !isOtherAddress && !manualPin && fix != null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          {isOtherAddress ? (
            <>
              <UserRound className="h-4 w-4" />
              Pilih lokasi penerima di peta
            </>
          ) : (
            <>
              <Radar className="h-4 w-4" />
              GPS · jarak dari {zoneCenter.name}
            </>
          )}
        </div>
        {!isOtherAddress && (
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
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Ongkir: Rp 10.000 (1–{DELIVERY_RADIUS_KM} km), di atas itu +Rp 2.000/km
      </p>

      <LocationMapInner
        key={isOtherAddress ? "pick-other" : "pick-self"}
        latitude={latitude}
        longitude={longitude}
        onLocationChange={handlePinDragEnd}
        onLocationPreview={isOtherAddress ? handlePinDragPreview : undefined}
        accuracyM={displayAccuracy}
        hubLat={zoneCenter.lat}
        hubLng={zoneCenter.lng}
        hubLabel={zoneCenter.name.slice(0, 1)}
        followGps={followGps}
        lockZoom={followGps && zoomLocked}
        manualPickMode={isOtherAddress}
        height={280}
      />

      <p className="text-center text-[11px] text-muted-foreground">
        {isOtherAddress
          ? "Ketuk peta atau geser pin biru ke alamat penerima"
          : followGps && zoomLocked
            ? "Zoom dikunci · mengikuti GPS realtime"
            : "Geser pin biru untuk koreksi manual"}{" "}
        · titik oranye = {zoneCenter.name}
      </p>

      {gpsError && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{gpsError}</p>
      )}

      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 ${
          tier1
            ? "border border-cyan-500/40 bg-cyan-500/10 glow-ring"
            : "border border-orange-500/40 bg-orange-500/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <MapPin className={`h-5 w-5 ${tier1 ? "text-cyan-400" : "text-orange-400"}`} />
          <div>
            <p className="text-xs text-muted-foreground">Jarak ke {zoneCenter.name}</p>
            <p className="text-lg font-bold tabular-nums">{displayDistance.toFixed(2)} km</p>
            {!isOtherAddress && displayAccuracy != null && displayAccuracy > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Akurasi GPS ±{Math.round(displayAccuracy)} m
              </p>
            )}
            {isOtherAddress && (
              <p className="text-[10px] text-muted-foreground">
                Titik dipilih manual di peta
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {describeDeliveryFee(displayDistance)}
          </p>
          <p className={`font-semibold ${tier1 ? "text-cyan-300" : "text-orange-200"}`}>
            {formatIdr(deliveryFee)}
          </p>
        </div>
      </div>
    </div>
  );
}
