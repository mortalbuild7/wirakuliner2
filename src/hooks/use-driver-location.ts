"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DriverStatus } from "@/types/database";
import { isCapacitorNative } from "@/lib/capacitor";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import { useDriverGpsBroadcast } from "@/hooks/use-driver-gps-broadcast";

async function persistLocationToDb(lat: number, lng: number) {
  await fetchWithDriverAuth("/api/driver/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, persist: true }),
  });
}

/**
 * GPS driver:
 * - Realtime Broadcast (WebSocket) setiap ~2 detik — pelacakan live tanpa spam UPDATE DB.
 * - Persist ke Postgres ~60 detik — untuk matching radius 3 km & dispatch.
 */
export function useDriverLocation(
  driverId: string | undefined,
  status: DriverStatus | undefined,
  enabled: boolean
) {
  const lastSent = useRef(0);
  const onPersist = useCallback(async (lat: number, lng: number) => {
    await persistLocationToDb(lat, lng);
  }, []);

  const publishGps = useDriverGpsBroadcast(driverId, status, enabled, onPersist);

  useEffect(() => {
    if (!enabled || !driverId || !status || status === "offline") return;

    let watchId: string | number | null = null;

    async function handlePosition(lat: number, lng: number) {
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
          if (err || !pos) return;
          void handlePosition(pos.coords.latitude, pos.coords.longitude);
        }
      );
    }

    function startBrowser() {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => void handlePosition(pos.coords.latitude, pos.coords.longitude),
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
