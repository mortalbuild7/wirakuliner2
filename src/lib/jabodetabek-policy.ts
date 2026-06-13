import {
  PAKET_CARGO_VOLUME_THRESHOLD_CM3,
  type ServiceType,
} from "@/lib/service-types";

/** Satu cluster operasional — Jakarta, Bogor, Depok, Tangerang, Bekasi. */
export const JABODETABEK_CLUSTER_CODE = "JABODETABEK";

/** Radius jemput driver motor (NGOJEK / PAKET kecil). */
export const MOTOR_PICKUP_RADIUS_KM = 5;

/** Radius jemput driver mobil & kargo (NGOMOBIL / PAKET besar). */
export const MOBIL_PICKUP_RADIUS_KM = 15;

/** Batas jarak ride motor dalam cluster (bukan gate AKAP). */
export const JABODETABEK_MOTOR_MAX_RIDE_KM = 80;

/** PostGIS RPC membatasi radius hingga 10 km — di atas itu pakai Haversine. */
export const POSTGIS_RPC_MAX_RADIUS_KM = 10;

/** @deprecated Gunakan `resolvePickupRadiusKm` — nilai default motor. */
export const CUSTOMER_DRIVER_RADIUS_KM = MOTOR_PICKUP_RADIUS_KM;

export const MAX_RADIUS_METERS = MOTOR_PICKUP_RADIUS_KM * 1000;

export const EMPTY_DRIVER_ZONE_MESSAGE =
  "Maaf, driver belum siap di wilayah ini. Coba lagi beberapa saat.";

export const OUTSIDE_JABODETABEK_MESSAGE =
  "Titik jemput di luar cluster operasional JABODETABEK.";

export function packageUsesCargoVehicle(packageVolumeCm3 = 0): boolean {
  return packageVolumeCm3 > PAKET_CARGO_VOLUME_THRESHOLD_CM3;
}

/** NGOMOBIL, PAKET mobil (volume besar), atau kategori kargo — layanan AKAP lintas kota/provinsi. */
export function isAkapTransitService(
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): boolean {
  if (serviceType === "NGOMOBIL") return true;
  if (serviceType === "PAKET" && packageUsesCargoVehicle(packageVolumeCm3)) return true;
  return false;
}

/** Radius penjemputan driver → customer (bukan jarak rute antar). */
export function resolvePickupRadiusKm(
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): number {
  if (serviceType === "NGOMOBIL") return MOBIL_PICKUP_RADIUS_KM;
  if (serviceType === "PAKET" && packageUsesCargoVehicle(packageVolumeCm3)) {
    return MOBIL_PICKUP_RADIUS_KM;
  }
  return MOTOR_PICKUP_RADIUS_KM;
}

/** Gate jarak maksimal rute jemput→antar — tidak berlaku untuk layanan AKAP. */
export function hasMaxDeliveryDistanceGate(
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): boolean {
  return !isAkapTransitService(serviceType, packageVolumeCm3);
}

export function resolveMaxDeliveryDistanceKm(
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): number | null {
  if (!hasMaxDeliveryDistanceGate(serviceType, packageVolumeCm3)) return null;
  return JABODETABEK_MOTOR_MAX_RIDE_KM;
}

export type TransitDistanceValidation =
  | { ok: true }
  | { ok: false; error: string; tooClose?: boolean; tooFar?: boolean };

/** Validasi jarak rute — tanpa gate kota/provinsi yang sama. */
export function validateTransitRideDistance(
  serviceType: ServiceType,
  distanceKm: number,
  packageVolumeCm3 = 0,
  minDistanceKm = 0.05
): TransitDistanceValidation {
  if (distanceKm < minDistanceKm) {
    return {
      ok: false,
      tooClose: true,
      error: "Titik jemput dan tujuan terlalu dekat",
    };
  }

  const maxKm = resolveMaxDeliveryDistanceKm(serviceType, packageVolumeCm3);
  if (maxKm != null && distanceKm > maxKm) {
    return {
      ok: false,
      tooFar: true,
      error: `Jarak maksimal ${maxKm} km untuk layanan ini`,
    };
  }

  return { ok: true };
}

export function isTransitProximityServiceType(serviceType: ServiceType): boolean {
  return serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType === "PAKET";
}
