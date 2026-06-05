/** Zoom tetap saat GPS lock (±1–20 m). */
export const GPS_LOCK_ZOOM = 19;

/** Zoom Leaflet dari akurasi GPS meter. */
export function zoomFromAccuracy(accuracyM: number): number {
  if (accuracyM <= 8) return GPS_LOCK_ZOOM;
  if (accuracyM <= 15) return 18;
  if (accuracyM <= 40) return 17;
  return 16;
}

export type MapLocationFix = {
  lat: number;
  lng: number;
  accuracy: number;
};
