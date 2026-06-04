/**
 * Reference point: Jalan Wira
 * Update coordinates to match your real street location.
 */
export const JALAN_WIRA = {
  name: "Jalan Wira",
  latitude: -5.1348,
  longitude: 119.4065,
} as const;

export const DELIVERY_RADIUS_KM = 3;
export const FLAT_DELIVERY_FEE_IDR = 12_000;

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

export function isWithinRadius(
  deliveryLat: number,
  deliveryLng: number,
  radiusKm = DELIVERY_RADIUS_KM
): boolean {
  return (
    haversineKm(
      JALAN_WIRA.latitude,
      JALAN_WIRA.longitude,
      deliveryLat,
      deliveryLng
    ) <= radiusKm
  );
}
