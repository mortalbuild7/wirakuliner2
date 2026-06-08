import { haversineKm } from "@/lib/geo-config";
import { kmPerHourFromDelta, MAX_VEHICLE_SPEED_KMH } from "@/lib/order-pricing";

/**
 * ALUR GPS — Anti Fake GPS / Velocity Check
 * Bandingkan ping baru dengan koordinat terakhir di database.
 * Jika kecepatan > batas kendaraan normal dalam jendela waktu → SUSPICIOUS.
 */

export const GPS_VELOCITY_WINDOW_SEC = 30;

export type GpsPingInput = {
  lat: number;
  lng: number;
  driverId: string;
};

export type LastGpsSnapshot = {
  lat: number | null;
  lng: number | null;
  pingAt: string | null;
};

export type VelocityCheckResult = {
  suspicious: boolean;
  distanceKm: number;
  elapsedSec: number;
  speedKmh: number;
  reason: string | null;
};

export function checkGpsVelocity(
  current: GpsPingInput,
  last: LastGpsSnapshot
): VelocityCheckResult {
  if (
    last.lat == null ||
    last.lng == null ||
    !last.pingAt ||
    !Number.isFinite(last.lat) ||
    !Number.isFinite(last.lng)
  ) {
    return {
      suspicious: false,
      distanceKm: 0,
      elapsedSec: 0,
      speedKmh: 0,
      reason: null,
    };
  }

  const elapsedMs = Date.now() - new Date(last.pingAt).getTime();
  const elapsedSec = Math.max(elapsedMs / 1000, 0.001);

  if (elapsedSec > GPS_VELOCITY_WINDOW_SEC * 4) {
    return {
      suspicious: false,
      distanceKm: 0,
      elapsedSec,
      speedKmh: 0,
      reason: null,
    };
  }

  const distanceKm = haversineKm(last.lat, last.lng, current.lat, current.lng);
  const speedKmh = kmPerHourFromDelta(distanceKm, elapsedSec);

  if (elapsedSec <= GPS_VELOCITY_WINDOW_SEC && speedKmh > MAX_VEHICLE_SPEED_KMH) {
    return {
      suspicious: true,
      distanceKm,
      elapsedSec,
      speedKmh,
      reason: `Loncat ${distanceKm.toFixed(2)} km dalam ${elapsedSec.toFixed(1)} d (~${speedKmh.toFixed(0)} km/jam)`,
    };
  }

  return {
    suspicious: false,
    distanceKm,
    elapsedSec,
    speedKmh,
    reason: null,
  };
}
