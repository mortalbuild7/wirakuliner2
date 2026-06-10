import { haversineKm } from "@/lib/geo-config";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import type { PaymentMethodChoice } from "@/components/wallet/payment-method-picker";
import {
  computePackageVolumeCm3,
  PAKET_CARGO_VOLUME_THRESHOLD_CM3,
  SERVICE_TYPE_LABEL,
  type ServiceType,
} from "@/lib/service-types";

/** Jarak minimum jemput–tujuan (km) — cegah order tidak masuk akal. */
export const NGOJEK_MIN_DISTANCE_KM = 0.05;

/** Jarak maksimum per ride (km) — batasi fraud koordinat jauh. */
export const NGOJEK_MAX_DISTANCE_KM = 25;

export type RideCoords = {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
};

export type RideQuote = {
  distanceKm: number;
  rideFee: number;
};

export type PackageDetailsInput = {
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  packageType: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type PlaceRidePayload = {
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  skipPayment: boolean;
  paymentMethod: "wallet" | "gateway";
  serviceType: ServiceType;
  packageDetails?: PackageDetailsInput;
};

/** Hitung jarak & tarif dari koordinat GPS (sumber kebenaran di client preview). */
export function quoteNgojekRide(coords: RideCoords): RideQuote {
  const distanceKm = haversineKm(
    coords.pickupLat,
    coords.pickupLng,
    coords.destLat,
    coords.destLng
  );
  return {
    distanceKm,
    rideFee: calculateDeliveryFee(distanceKm),
  };
}

export type RideValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Validasi field paket sebelum submit PAKET. */
export function validatePackageDetails(
  pkg: PackageDetailsInput | null | undefined
): RideValidationResult {
  if (!pkg) {
    return { ok: false, error: "Lengkapi data pengirim, penerima, dan dimensi paket" };
  }

  const fields: [string, string][] = [
    ["senderName", pkg.senderName],
    ["senderPhone", pkg.senderPhone],
    ["recipientName", pkg.recipientName],
    ["recipientPhone", pkg.recipientPhone],
    ["packageType", pkg.packageType],
  ];

  for (const [, value] of fields) {
    if (!value?.trim()) {
      return { ok: false, error: "Semua data paket wajib diisi" };
    }
  }

  if (pkg.weightKg <= 0 || pkg.lengthCm <= 0 || pkg.widthCm <= 0 || pkg.heightCm <= 0) {
    return { ok: false, error: "Berat dan dimensi paket harus lebih dari 0" };
  }

  if (pkg.weightKg > 500) {
    return { ok: false, error: "Berat maksimal 500 kg" };
  }

  return { ok: true };
}

export function packageVolumeCm3(pkg: PackageDetailsInput): number {
  return computePackageVolumeCm3(pkg.lengthCm, pkg.widthCm, pkg.heightCm);
}

export function packageNeedsCargoVehicle(pkg: PackageDetailsInput): boolean {
  return packageVolumeCm3(pkg) > PAKET_CARGO_VOLUME_THRESHOLD_CM3;
}

/** Validasi bisnis sebelum memanggil API place-ride / transit. */
export function validateTransitBooking(input: {
  userId: string | null;
  serviceType: ServiceType;
  destinationAddress: string;
  distanceKm: number;
  pickupInServiceArea: boolean;
  destinationInServiceArea: boolean;
  sameServiceCity: boolean;
  paymentMethod: PaymentMethodChoice;
  walletBalance: number | null;
  rideFee: number;
  packageDetails?: PackageDetailsInput | null;
}): RideValidationResult {
  if (!input.userId) {
    return { ok: false, error: "Silakan login terlebih dahulu" };
  }

  if (!input.destinationAddress.trim()) {
    return { ok: false, error: "Isi alamat tujuan" };
  }

  if (input.distanceKm < NGOJEK_MIN_DISTANCE_KM) {
    return { ok: false, error: "Titik jemput dan tujuan terlalu dekat" };
  }

  if (input.distanceKm > NGOJEK_MAX_DISTANCE_KM) {
    return {
      ok: false,
      error: `Jarak maksimal ${NGOJEK_MAX_DISTANCE_KM} km`,
    };
  }

  if (input.serviceType === "PAKET") {
    const pkgCheck = validatePackageDetails(input.packageDetails);
    if (!pkgCheck.ok) return pkgCheck;
  }

  const serviceLabel = SERVICE_TYPE_LABEL[input.serviceType];

  if (!input.pickupInServiceArea) {
    return {
      ok: false,
      error: `Titik jemput di luar wilayah layanan ${serviceLabel}`,
    };
  }

  if (!input.destinationInServiceArea) {
    return {
      ok: false,
      error: `Tujuan di luar wilayah layanan ${serviceLabel}`,
    };
  }

  if (!input.sameServiceCity) {
    return {
      ok: false,
      error: "Jemput dan tujuan harus dalam kota layanan yang sama",
    };
  }

  if (
    input.paymentMethod === "wallet" &&
    (input.walletBalance == null || input.walletBalance < input.rideFee)
  ) {
    return {
      ok: false,
      error: `Saldo dompet tidak cukup untuk tarif ${serviceLabel}`,
    };
  }

  return { ok: true };
}

/** @deprecated Gunakan validateTransitBooking */
export const validateNgojekBooking = validateTransitBooking;

export function buildPlaceRidePayload(input: {
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  paymentMethod: PaymentMethodChoice;
  paymentBypass: boolean;
  serviceType?: ServiceType;
  packageDetails?: PackageDetailsInput;
}): PlaceRidePayload {
  const payload: PlaceRidePayload = {
    pickupAddress: input.pickupAddress.trim() || "Lokasi jemput",
    destinationAddress: input.destinationAddress.trim(),
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    destinationLat: input.destLat,
    destinationLng: input.destLng,
    skipPayment: input.paymentBypass,
    paymentMethod: input.paymentMethod === "wallet" ? "wallet" : "gateway",
    serviceType: input.serviceType ?? "NGOJEK",
  };

  if (input.packageDetails && payload.serviceType === "PAKET") {
    payload.packageDetails = input.packageDetails;
  }

  return payload;
}
