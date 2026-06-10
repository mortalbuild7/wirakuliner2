import { haversineKm } from "@/lib/geo-config";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import type { PaymentMethodChoice } from "@/components/wallet/payment-method-picker";

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

export type PlaceRidePayload = {
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  skipPayment: boolean;
  paymentMethod: "wallet" | "gateway";
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

/** Validasi bisnis sebelum memanggil API place-ride. */
export function validateNgojekBooking(input: {
  userId: string | null;
  destinationAddress: string;
  distanceKm: number;
  pickupInServiceArea: boolean;
  destinationInServiceArea: boolean;
  sameServiceCity: boolean;
  paymentMethod: PaymentMethodChoice;
  walletBalance: number | null;
  rideFee: number;
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
      error: `Jarak maksimal NGOJEK ${NGOJEK_MAX_DISTANCE_KM} km`,
    };
  }

  if (!input.pickupInServiceArea) {
    return {
      ok: false,
      error: "Titik jemput di luar wilayah layanan NGOJEK",
    };
  }

  if (!input.destinationInServiceArea) {
    return {
      ok: false,
      error: "Tujuan di luar wilayah layanan NGOJEK",
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
      error: "Saldo dompet tidak cukup untuk tarif NGOJEK ini",
    };
  }

  return { ok: true };
}

export function buildPlaceRidePayload(input: {
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  paymentMethod: PaymentMethodChoice;
  paymentBypass: boolean;
}): PlaceRidePayload {
  return {
    pickupAddress: input.pickupAddress.trim() || "Lokasi jemput",
    destinationAddress: input.destinationAddress.trim(),
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    destinationLat: input.destLat,
    destinationLng: input.destLng,
    skipPayment: input.paymentBypass,
    paymentMethod: input.paymentMethod === "wallet" ? "wallet" : "gateway",
  };
}
