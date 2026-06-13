"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DriverStatus } from "@/types/database";
import { isCapacitorNative } from "@/lib/capacitor";
import { flushDriverGpsToServer, persistDriverGps } from "@/lib/driver-gps-sync";
import { useDriverGpsBroadcast } from "@/hooks/use-driver-gps-broadcast";

/**
 * GPS driver:
 * - Saat ONLINE: `watchPosition` terus-menerus + flush GPS pertama ke DB.
 * - Realtime Broadcast (WebSocket) setiap ~2 detik — pelacakan live tanpa spam UPDATE DB.
 * - Persist ke Postgres setiap ~20 detik atau saat bergerak ≥25 m — untuk matching radius 3 km.
 * - Saat OFFLINE: `clearWatch` agar HP tidak panas.
 */
export function useDriverLocation(
  driverId: string | undefined,
  status: DriverStatus | undefined,
  enabled: boolean
) {
  const lastSent = useRef(0);
  const onPersist = useCallback(async (lat: number, lng: number) => {
    await persistDriverGps(lat, lng);
  }, []);

  const publishGps = useDriverGpsBroadcast(driverId, status, enabled, onPersist);

  useEffect(() => {
    if (!enabled || !driverId || !status || status === "offline") return;

    void flushDriverGpsToServer();

    let watchId: string | number | null = null;
    let cancelled = false;

    async function handlePosition(lat: number, lng: number) {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastSent.current < 2_000) return;
      lastSent.current = now;
      await publishGps(lat, lng);
    }

    async function startNative() {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") return;

      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 12_000 },
        (pos, err) => {
          if (err || !pos || cancelled) return;
          void handlePosition(pos.coords.latitude, pos.coords.longitude);
        }
      );
    }

    function startBrowser() {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          void handlePosition(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
      );
    }

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
  }, [driverId, status, enabled, publishGps]);
}
