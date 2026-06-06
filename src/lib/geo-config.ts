/**
 * Zona antar 3 km dihitung dari koordinat toko (merchant.latitude / longitude).
 * JALAN_WIRA hanya referensi peta default, bukan pusat radius pesanan.
 */
function parseCoord(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Pusat peta default (bukan pusat radius pesanan). */
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

/** Pusat radius 3 km = koordinat toko yang dipesan. */
export function deliveryZoneCenter(
  merchantLat?: number | null,
  merchantLng?: number | null,
  merchantName?: string | null
): ZoneCenter | null {
  if (
    merchantLat == null ||
    merchantLng == null ||
    !Number.isFinite(merchantLat) ||
    !Number.isFinite(merchantLng)
  ) {
    return null;
  }
  return {
    lat: merchantLat,
    lng: merchantLng,
    name: merchantName?.trim() || "Toko",
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

/** @deprecated Gunakan distanceToZone dari koordinat toko. */
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

/** Cek dalam radius 3 km dari titik toko (wajib beri centerLat/centerLng merchant). */
export function isWithinRadius(
  deliveryLat: number,
  deliveryLng: number,
  centerLat: number,
  centerLng: number,
  radiusKm = DELIVERY_RADIUS_KM
): boolean {
  return distanceToZone(deliveryLat, deliveryLng, centerLat, centerLng) <= radiusKm;
}

/** Radius 3 km dari toko + toleransi akurasi GPS pelanggan. */
export function isWithinDeliveryZone(
  deliveryLat: number,
  deliveryLng: number,
  centerLat: number,
  centerLng: number,
  accuracyMeters?: number | null,
  radiusKm = DELIVERY_RADIUS_KM
): boolean {
  const dist = distanceToZone(deliveryLat, deliveryLng, centerLat, centerLng);
  const effectiveRadius = radiusKm + gpsToleranceKm(accuracyMeters);
  return dist <= effectiveRadius;
}

/** Shortcut: cek zona antar dari koordinat merchant. */
export function isWithinMerchantDeliveryZone(
  deliveryLat: number,
  deliveryLng: number,
  merchantLat: number,
  merchantLng: number,
  accuracyMeters?: number | null,
  radiusKm = DELIVERY_RADIUS_KM
): boolean {
  return isWithinDeliveryZone(
    deliveryLat,
    deliveryLng,
    merchantLat,
    merchantLng,
    accuracyMeters,
    radiusKm
  );
}
