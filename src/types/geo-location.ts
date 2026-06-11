/** Titik geografis lengkap — dikirim ke driver & disimpan di order. */
export type GeoLocationPoint = {
  address: string;
  latitude: number;
  longitude: number;
};

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
