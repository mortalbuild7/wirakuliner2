/** Tarif ongkir: dasar Rp 10.000 (1–3 km), di atas 3 km + Rp 2.000/km. */
export const DELIVERY_FEE_BASE_IDR = 10_000;
export const DELIVERY_FEE_EXTRA_PER_KM = 2_000;
export const DELIVERY_FEE_TIER1_MAX_KM = 3;

export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  if (distanceKm <= DELIVERY_FEE_TIER1_MAX_KM) {
    return DELIVERY_FEE_BASE_IDR;
  }
  const extra = (distanceKm - DELIVERY_FEE_TIER1_MAX_KM) * DELIVERY_FEE_EXTRA_PER_KM;
  return Math.round(DELIVERY_FEE_BASE_IDR + extra);
}

export function describeDeliveryFee(distanceKm: number): string {
  if (distanceKm <= 0) return "Gratis";
  if (distanceKm <= DELIVERY_FEE_TIER1_MAX_KM) {
    return `Tarif dasar 1–${DELIVERY_FEE_TIER1_MAX_KM} km`;
  }
  const extra = distanceKm - DELIVERY_FEE_TIER1_MAX_KM;
  return `Rp 10.000 + Rp 2.000/km × ${extra.toFixed(2)} km`;
}

export function isTier1Distance(distanceKm: number): boolean {
  return distanceKm <= DELIVERY_FEE_TIER1_MAX_KM;
}
