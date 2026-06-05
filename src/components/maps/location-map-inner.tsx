"use client";

import { GpsLockMapInner } from "@/components/maps/gps-lock-map-inner";

export function LocationMapInner({
  latitude,
  longitude,
  onLocationChange,
  accuracyM,
  hubLat,
  hubLng,
  hubLabel = "W",
  followGps = false,
  lockZoom = true,
  height = 220,
}: {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  accuracyM?: number | null;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  followGps?: boolean;
  lockZoom?: boolean;
  height?: number;
}) {
  return (
    <GpsLockMapInner
      userLat={latitude}
      userLng={longitude}
      userAccuracyM={accuracyM}
      hubLat={hubLat}
      hubLng={hubLng}
      hubLabel={hubLabel}
      followGps={followGps}
      lockZoom={lockZoom}
      draggableUser
      onUserDrag={onLocationChange}
      height={height}
    />
  );
}
