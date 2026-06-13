"use server";

import {
  reverseGeocodeCoords,
  searchGeocodeQuery,
} from "@/lib/geocode-server";
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
 * Reverse geocoding server-side — API key / Nominatim tidak pernah ke browser.
 * Dipanggil saat peta jemput berhenti digeser (onMoveEnd / onCameraIdle).
 * Fallback Nominatim OSM gratis jika GOOGLE_GEOCODING_API_KEY kosong.
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
      // Fallback koordinat mentah jika geocoder tidak mengembalikan label
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
