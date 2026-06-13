"use client";

import { isCapacitorNative } from "@/lib/capacitor";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";

export type DriverGpsReading = { lat: number; lng: number };

function isValidGps(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 1e-9 &&
    Math.abs(lng) > 1e-9 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Satu kali baca GPS asli HP driver (Capacitor atau browser). */
export async function readDriverGpsOnce(): Promise<DriverGpsReading | null> {
  if (typeof window === "undefined") return null;

  if (isCapacitorNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000,
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      return isValidGps(lat, lng) ? { lat, lng } : null;
    } catch {
      return null;
    }
  }

  if (!navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        resolve(isValidGps(lat, lng) ? { lat, lng } : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  });
}

/** Paksa UPDATE `current_lat` / `current_lng` di database (persist: true). */
export async function persistDriverGps(lat: number, lng: number): Promise<boolean> {
  if (!isValidGps(lat, lng)) return false;

  const res = await fetchWithDriverAuth("/api/driver/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, persist: true }),
  });
  return res.ok;
}

/** Baca GPS sekali lalu langsung sinkronkan ke database — dipanggil saat driver ONLINE. */
export async function flushDriverGpsToServer(): Promise<boolean> {
  const reading = await readDriverGpsOnce();
  if (!reading) return false;
  return persistDriverGps(reading.lat, reading.lng);
}
