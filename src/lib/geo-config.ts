/**
 * Pusat zona antar: WIRA Kuliner — Jl. Me. Wira 12, Parung, Bogor.
 * Override via NEXT_PUBLIC_JALAN_WIRA_LAT / NEXT_PUBLIC_JALAN_WIRA_LNG
 */
function parseCoord(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const JALAN_WIRA = {
  name: "Jl. Me. Wira, Parung",
  address:
    "Jl. Me. Wira 12, Parung, Kec. Parung, Kabupaten Bogor, Jawa Barat 16330",
  latitude: parseCoord(process.env.NEXT_PUBLIC_JALAN_WIRA_LAT, -6.42776),
  longitude: parseCoord(process.env.NEXT_PUBLIC_JALAN_WIRA_LNG, 106.727392),
} as const;

export const DELIVERY_RADIUS_KM = 3;
export const FLAT_DELIVERY_FEE_IDR = 12_000;
/** Toleransi akurasi GPS (maks tambahan radius km) */
export const MAX_GPS_TOLERANCE_KM = 1;

export type ZoneCenter = {
  lat: number;
  lng: number;
  name: string;
};

/** Pusat radius: koordinat toko yang dipesan (paling akurat), fallback pusat WIRA. */
export function deliveryZoneCenter(
  merchantLat?: number | null,
  merchantLng?: number | null,
  merchantName?: string | null
): ZoneCenter {
  if (
    merchantLat != null &&
    merchantLng != null &&
    Number.isFinite(merchantLat) &&
    Number.isFinite(merchantLng)
  ) {
    return {
      lat: merchantLat,
      lng: merchantLng,
      name: merchantName?.trim() || "Toko",
    };
  }
  return {
    lat: JALAN_WIRA.latitude,
    lng: JALAN_WIRA.longitude,
    name: JALAN_WIRA.name,
  };
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceFromJalanWira(deliveryLat: number, deliveryLng: number): number {
  return haversineKm(
    JALAN_WIRA.latitude,
    JALAN_WIRA.longitude,
    deliveryLat,
    deliveryLng
  );
}

export function distanceToZone(
  deliveryLat: number,
  deliveryLng: number,
  centerLat: number,
  centerLng: number
): number {
  return haversineKm(centerLat, centerLng, deliveryLat, deliveryLng);
}

export function gpsToleranceKm(accuracyMeters?: number | null): number {
  if (!accuracyMeters || accuracyMeters <= 0) return 0;
  return Math.min(accuracyMeters / 1000, MAX_GPS_TOLERANCE_KM);
}

export function isWithinRadius(
  deliveryLat: number,
  deliveryLng: number,
  radiusKm = DELIVERY_RADIUS_KM,
  centerLat = JALAN_WIRA.latitude,
  centerLng = JALAN_WIRA.longitude
): boolean {
  return distanceToZone(deliveryLat, deliveryLng, centerLat, centerLng) <= radiusKm;
}

/** Radius + toleransi akurasi GPS (server & client). */
export function isWithinDeliveryZone(
  deliveryLat: number,
  deliveryLng: number,
  accuracyMeters?: number | null,
  radiusKm = DELIVERY_RADIUS_KM,
  centerLat = JALAN_WIRA.latitude,
  centerLng = JALAN_WIRA.longitude
): boolean {
  const dist = distanceToZone(deliveryLat, deliveryLng, centerLat, centerLng);
  const effectiveRadius = radiusKm + gpsToleranceKm(accuracyMeters);
  return dist <= effectiveRadius;
}
