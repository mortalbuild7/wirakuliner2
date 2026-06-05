"use client";

import { useEffect, useState } from "react";
import { isCapacitorNative } from "@/lib/capacitor";
import { GPS_LOCK_ZOOM, type MapLocationFix } from "@/lib/map-location";

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

/** GPS realtime + zoom lock untuk peta customer & driver. */
export function useMapLocation(enabled: boolean) {
  const [fix, setFix] = useState<MapLocationFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [bestAccuracy, setBestAccuracy] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let watchId: string | number | null = null;
    let cancelled = false;

    function apply(lat: number, lng: number, accuracy: number) {
      if (cancelled) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const acc = accuracy > 0 ? accuracy : 20;
      setFix({ lat, lng, accuracy: acc });
      setBestAccuracy((prev) => (prev == null ? acc : Math.min(prev, acc)));
      setLoading(false);
    }

    async function startNative() {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        setLoading(false);
        return;
      }

      const current = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
      }).catch(() => null);
      if (current) {
        apply(
          current.coords.latitude,
          current.coords.longitude,
          current.coords.accuracy
        );
      }

      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20_000 },
        (pos, err) => {
          if (err || !pos) return;
          apply(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        }
      );
    }

    function startBrowser() {
      if (!navigator.geolocation) {
        setLoading(false);
        return;
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          apply(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => setLoading(false),
        WATCH_OPTIONS
      );
      watchId = navigator.geolocation.watchPosition(
        (pos) =>
          apply(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => {},
        WATCH_OPTIONS
      );
    }

    setLoading(true);
    if (isCapacitorNative()) {
      void startNative();
    } else {
      startBrowser();
    }

    return () => {
      cancelled = true;
      if (watchId == null) return;
      if (isCapacitorNative()) {
        import("@capacitor/geolocation").then(({ Geolocation }) => {
          if (typeof watchId === "string") Geolocation.clearWatch({ id: watchId });
        });
      } else if (typeof watchId === "number") {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enabled]);

  return {
    fix,
    loading,
    bestAccuracy,
    zoom: GPS_LOCK_ZOOM,
    zoomLocked: fix != null,
  };
}
