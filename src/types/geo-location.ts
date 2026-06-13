/**
 * Titik geografis lengkap — dikirim ke driver & disimpan di order.
 * Struktur wajib: alamat terbaca manusia + koordinat desimal WGS84.
 */
export type GeoLocationPoint = {
  /** Label alamat dari reverse/forward geocode atau input pengguna. */
  address: string;
  /** Garis lintang (−90 … 90). */
  latitude: number;
  /** Garis bujur (−180 … 180). */
  longitude: number;
};

/**
 * Validasi titik geo sebelum dikirim ke API order / driver.
 * Mencegah NaN atau koordinat di luar bumi masuk ke database.
 */
export function isValidGeoPoint(p: GeoLocationPoint | null | undefined): boolean {
  if (!p) return false;
  return (
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    p.latitude >= -90 &&
    p.latitude <= 90 &&
    p.longitude >= -180 &&
    p.longitude <= 180
  );
}
