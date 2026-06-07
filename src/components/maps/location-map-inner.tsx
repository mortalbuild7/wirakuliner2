"use client";

import {
  GpsLockMapInner,
  type ManualPickCenter,
} from "@/components/maps/gps-lock-map-inner";

export function LocationMapInner({
  latitude,
  longitude,
  onLocationChange,
  onLocationPreview,
  accuracyM,
  hubLat,
  hubLng,
  hubLabel = "W",
  followGps = false,
  lockZoom = true,
  manualPickMode = false,
  manualPickCenter = "hub",
  showRadius = true,
  flyToTrigger,
  height = 220,
}: {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  onLocationPreview?: (lat: number, lng: number) => void;
  accuracyM?: number | null;
  hubLat: number;
  hubLng: number;
  hubLabel?: string;
  followGps?: boolean;
  lockZoom?: boolean;
  manualPickMode?: boolean;
  manualPickCenter?: ManualPickCenter;
  showRadius?: boolean;
  flyToTrigger?: number;
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
      showRadius={showRadius}
      followGps={followGps}
      lockZoom={lockZoom}
      manualPickMode={manualPickMode}
      manualPickCenter={manualPickCenter}
      draggableUser
      onUserDrag={onLocationChange}
      onUserDragPreview={onLocationPreview}
      flyToTrigger={flyToTrigger}
      height={height}
    />
  );
}
