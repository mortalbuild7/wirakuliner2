"use server";

import {
  reverseGeocodeCoords,
  searchGeocodeQuery,
} from "@/lib/geocode-server";
import {
  geoLocationFromCoords,
  resolveAddressFromGeocode,
} from "@/lib/geocode-resilient";
import type { GeoLocationPoint } from "@/types/geo-location";

/** Hasil reverse geocode — koordinat → alamat terbaca manusia. */
export type GeoAddressResult =
  | { ok: true; location: GeoLocationPoint }
  | { ok: false; error: string };

/** Hasil pencarian alamat — daftar kandidat untuk autocomplete. */
export type GeoSearchResult =
  | { ok: true; results: GeoLocationPoint[] }
  | { ok: false; error: string };

/** Batasi koordinat ke rentang valid WGS84 — cegah injeksi nilai absurd. */
function clampCoord(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/**
 * Reverse geocoding server-side — tidak pernah memblokir alur order.
 * Jika geocoder gagal/rate-limit, selalu kembalikan koordinat + label fallback.
 */
export async function getAddressFromCoordinates(
  lat: number,
  lng: number
): Promise<GeoAddressResult> {
  const latitude = clampCoord(lat, -90, 90);
  const longitude = clampCoord(lng, -180, 180);
  if (latitude == null || longitude == null) {
    return {
      ok: true,
      location: geoLocationFromCoords(lat, lng),
    };
  }

  try {
    const hit = await reverseGeocodeCoords(latitude, longitude);
    const address = resolveAddressFromGeocode(hit?.label, latitude, longitude);
    return {
      ok: true,
      location: {
        address,
        latitude: hit?.lat ?? latitude,
        longitude: hit?.lng ?? longitude,
      },
    };
  } catch (e) {
    console.warn("[geocode] reverse fallback:", e);
    return {
      ok: true,
      location: geoLocationFromCoords(latitude, longitude),
    };
  }
}

/**
 * Pencarian alamat manual (forward geocode) — autocomplete LocationSearchBar.
 * Hasil klik memicu panTo di PickupMapContainer via store bumpPickupMapFly.
 */
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
