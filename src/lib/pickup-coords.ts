/** Pesan standar saat koordinat jemput customer tidak valid / kosong. */
export const CUSTOMER_GPS_REQUIRED_MSG =
  "Gagal mendapatkan lokasi GPS Anda. Mohon aktifkan izin lokasi HP Anda.";

/** Hint ringan saat GPS belum mengunci koordinat asli (bukan blokir layanan). */
export const CUSTOMER_GPS_INITIALIZING_MSG =
  "Sedang mengunci GPS HP Anda...";

/** Hint saat GPS submit belum siap — minta user coba lagi sebentar. */
export const CUSTOMER_GPS_SYNC_MSG =
  "Sedang menyinkronkan GPS HP Anda, mohon tunggu 2 detik dan klik kembali.";

export type CustomerServiceGateStatus = "INITIAL" | "CHECKING" | "AVAILABLE" | "UNAVAILABLE";

export type CustomerGpsInitStatus = "INITIALIZING_GPS" | "READY";

/** Status GPS customer — hanya berdasarkan koordinat valid, tanpa cek wilayah teks. */
export function resolveCustomerGpsInitStatus(
  lat: unknown,
  lng: unknown
): CustomerGpsInitStatus {
  return isValidPickupCoordinates(lat, lng) ? "READY" : "INITIALIZING_GPS";
}

/** Pesan server saat parsing koordinat gagal (NaN / kosong). */
export const INVALID_CUSTOMER_GPS_COORDS_MSG =
  "Koordinat GPS HP Customer tidak valid";

function isZeroCoord(n: number): boolean {
  return Math.abs(n) < 1e-9;
}

/**
 * Parsing defensif — parseFloat(String(value).trim()) dari HP/form.
 */
export function parsePickupFloat(value: unknown): number {
  if (value == null) return Number.NaN;
  return parseFloat(String(value).trim());
}

/** Validasi koordinat jemput — tanpa fallback ke lokasi default. */
export function isValidPickupCoordinates(lat: unknown, lng: unknown): boolean {
  const customerLat = parsePickupFloat(lat);
  const customerLng = parsePickupFloat(lng);

  const latOk =
    Number.isFinite(customerLat) &&
    !isNaN(customerLat) &&
    !isZeroCoord(customerLat) &&
    customerLat >= -90 &&
    customerLat <= 90;
  const lngOk =
    Number.isFinite(customerLng) &&
    !isNaN(customerLng) &&
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
  return {
    ok: true,
    lat: parsePickupFloat(lat),
    lng: parsePickupFloat(lng),
  };
}
