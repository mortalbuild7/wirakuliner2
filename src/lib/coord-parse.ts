import { JALAN_WIRA } from "@/lib/geo-config";
import {
  INVALID_CUSTOMER_GPS_COORDS_MSG,
  parsePickupFloat,
} from "@/lib/pickup-coords";

/** Pusat operasional default — hanya untuk tampilan peta, bukan matching driver. */
export const DEFAULT_OPS_CENTER = {
  name: JALAN_WIRA.name,
  lat: JALAN_WIRA.latitude,
  lng: JALAN_WIRA.longitude,
} as const;

export type ParsedCustomerCoords = {
  lat: number;
  lng: number;
  /** Koordinat numerik valid dan bukan 0,0. */
  isValid: boolean;
  rawLat: unknown;
  rawLng: unknown;
};

function isZeroCoord(n: number): boolean {
  return Math.abs(n) < 1e-9;
}

/**
 * Parsing defensif latitude/longitude dari HP Customer.
 * parseFloat(String(value).trim()) — anti string mentah & anti NaN.
 */
export function parseCustomerCoords(
  lat: unknown,
  lng: unknown
): ParsedCustomerCoords {
  const customerLat = parsePickupFloat(lat);
  const customerLng = parsePickupFloat(lng);

  const latOk =
    Number.isFinite(customerLat) &&
    !isNaN(customerLat) &&
    !isZeroCoord(customerLat) &&
    customerLat >= -90 &&
    customerLat <= 90;
  const lngOk =
    Number.isFinite(customerLng) &&
    !isNaN(customerLng) &&
    !isZeroCoord(customerLng) &&
    customerLng >= -180 &&
    customerLng <= 180;

  if (latOk && lngOk) {
    return {
      lat: customerLat,
      lng: customerLng,
      isValid: true,
      rawLat: lat,
      rawLng: lng,
    };
  }

  return {
    lat: Number.isFinite(customerLat) && !isNaN(customerLat) ? customerLat : 0,
    lng: Number.isFinite(customerLng) && !isNaN(customerLng) ? customerLng : 0,
    isValid: false,
    rawLat: lat,
    rawLng: lng,
  };
}

export { INVALID_CUSTOMER_GPS_COORDS_MSG };
