export type GeocodeHit = {
  lat: number;
  lng: number;
  label: string;
};

export function formatGeocodeLabel(raw: string): string {
  return raw.replace(/,\s*Indonesia$/i, "").trim();
}
