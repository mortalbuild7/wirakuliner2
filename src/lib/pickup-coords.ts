/** Pesan standar saat koordinat jemput customer tidak valid / kosong. */
export const CUSTOMER_GPS_REQUIRED_MSG =
  "Gagal mendapatkan lokasi GPS Anda. Mohon aktifkan izin lokasi HP Anda.";

function isZeroCoord(n: number): boolean {
  return Math.abs(n) < 1e-9;
}

/** Validasi koordinat jemput — tanpa fallback ke lokasi default. */
export function isValidPickupCoordinates(lat: unknown, lng: unknown): boolean {
  const customerLat = Number(lat);
  const customerLng = Number(lng);

  const latOk =
    Number.isFinite(customerLat) &&
    !isZeroCoord(customerLat) &&
    customerLat >= -90 &&
    customerLat <= 90;
  const lngOk =
    Number.isFinite(customerLng) &&
    !isZeroCoord(customerLng) &&
    customerLng >= -180 &&
    customerLng <= 180;

  return latOk && lngOk;
}

export function validatePickupCoordinates(
  lat: unknown,
  lng: unknown
): { ok: true; lat: number; lng: number } | { ok: false } {
  if (!isValidPickupCoordinates(lat, lng)) return { ok: false };
  return { ok: true, lat: Number(lat), lng: Number(lng) };
}
