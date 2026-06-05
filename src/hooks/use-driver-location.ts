"use client";

import { useEffect, useRef } from "react";
import type { DriverStatus } from "@/types/database";
import { isCapacitorNative } from "@/lib/capacitor";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";

const INTERVAL_MS = 15_000;

async function sendLocation(lat: number, lng: number) {
  await fetchWithDriverAuth("/api/driver/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
}

/** Kirim GPS ke server — native Capacitor atau browser geolocation */
export function useDriverLocation(
  driverId: string | undefined,
  status: DriverStatus | undefined,
  enabled: boolean
) {
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled || !driverId || !status || status === "offline") return;

    let watchId: string | number | null = null;
    let cancelled = false;

    let firstSend = true;

    async function send(lat: number, lng: number) {
      const now = Date.now();
      if (!firstSend && now - lastSent.current < INTERVAL_MS) return;
      firstSend = false;
      lastSent.current = now;
      await sendLocation(lat, lng);
    }

    async function startNative() {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") return;

      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 12_000 },
        (pos, err) => {
          if (err || !pos) return;
          send(pos.coords.latitude, pos.coords.longitude);
        }
      );
    }

    function startBrowser() {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => send(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
      );
    }

    if (isCapacitorNative()) {
      startNative();
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
      void cancelled;
    };
  }, [driverId, status, enabled]);
}
