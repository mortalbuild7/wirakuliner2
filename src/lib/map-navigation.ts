/** Bearing derajat dari titik A ke B (0 = utara). */
export function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const DRIVER_NAV_ZOOM = 17;

/** URL Google Maps untuk navigasi mengemudi ke koordinat. */
export function googleMapsDirectionsUrl(lat: number, lng: number, label?: string) {
  const dest = `${lat},${lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
  });
  if (label) params.set("destination_place_id", "");
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openMapNavigation(lat: number, lng: number, label?: string) {
  const url = googleMapsDirectionsUrl(lat, lng, label);
  window.open(url, "_blank", "noopener,noreferrer");
}
