import type { GeoLocationPoint } from "@/types/geo-location";

/** Label default saat reverse geocode gagal — tetap bisa lanjut cek driver by koordinat. */
export function gpsCoordFallbackAddress(lat: number, lng: number): string {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "Lokasi GPS";
  }
  return `Lokasi GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
}

/**
 * Alamat final: pakai hasil geocoder jika ada, else fallback koordinat mentah.
 * Tidak pernah mengembalikan string kosong.
 */
export function resolveAddressFromGeocode(
  parsedAddress: string | null | undefined,
  lat: number,
  lng: number,
  defaultLabel?: string
): string {
  const trimmed = parsedAddress?.trim();
  if (trimmed) return trimmed;
  if (defaultLabel?.trim()) return defaultLabel.trim();
  return gpsCoordFallbackAddress(lat, lng);
}

export function geoLocationFromCoords(
  lat: number,
  lng: number,
  address?: string | null
): GeoLocationPoint {
  return {
    address: resolveAddressFromGeocode(address, lat, lng),
    latitude: lat,
    longitude: lng,
  };
}
