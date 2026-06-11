"use server";

import {
  reverseGeocodeCoords,
  searchGeocodeQuery,
} from "@/lib/geocode-server";
import type { GeoLocationPoint } from "@/types/geo-location";

export type GeoAddressResult =
  | { ok: true; location: GeoLocationPoint }
  | { ok: false; error: string };

export type GeoSearchResult =
  | { ok: true; results: GeoLocationPoint[] }
  | { ok: false; error: string };

function clampCoord(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/**
 * Reverse geocoding server-side — API key tidak pernah dikirim ke browser.
 * Mengubah koordinat hasil geser peta menjadi alamat terbaca manusia.
 */
export async function getAddressFromCoordinates(
  lat: number,
  lng: number
): Promise<GeoAddressResult> {
  const latitude = clampCoord(lat, -90, 90);
  const longitude = clampCoord(lng, -180, 180);
  if (latitude == null || longitude == null) {
    return { ok: false, error: "Koordinat tidak valid" };
  }

  try {
    const hit = await reverseGeocodeCoords(latitude, longitude);
    if (!hit) {
      return {
        ok: true,
        location: {
          address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          latitude,
          longitude,
        },
      };
    }
    return {
      ok: true,
      location: {
        address: hit.label,
        latitude: hit.lat,
        longitude: hit.lng,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memuat alamat";
    return { ok: false, error: msg };
  }
}

/** Pencarian alamat manual — autocomplete dropdown (forward geocode). */
export async function searchAddresses(
  query: string,
  nearLat?: number,
  nearLng?: number
): Promise<GeoSearchResult> {
  const q = query.trim();
  if (q.length < 3) {
    return { ok: false, error: "Ketik minimal 3 karakter" };
  }

  const lat =
    nearLat != null ? clampCoord(nearLat, -90, 90) ?? undefined : undefined;
  const lng =
    nearLng != null ? clampCoord(nearLng, -180, 180) ?? undefined : undefined;

  try {
    const hits = await searchGeocodeQuery(q, lat, lng);
    return {
      ok: true,
      results: hits.map((h) => ({
        address: h.label,
        latitude: h.lat,
        longitude: h.lng,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pencarian gagal";
    return { ok: false, error: msg };
  }
}
