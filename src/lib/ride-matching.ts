import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseGeocodeCoords } from "@/lib/geocode-server";
import { haversineKm } from "@/lib/geo-config";
import {
  EMPTY_DRIVER_ZONE_MESSAGE,
  findCustomerNearbyDrivers,
} from "@/lib/customer-driver-match";
import {
  checkServiceAvailability,
  loadActiveServiceCities,
  findCityForCoords,
  type ServiceAvailability,
} from "@/lib/service-area";
import { resolveClusterIdForCoords } from "@/lib/operational-cluster";
import type { PriorityDriverMatchRow, RideMatchingMode } from "@/lib/ride-matching-types";

export type { PriorityDriverMatchRow, RideMatchingMode } from "@/lib/ride-matching-types";

/** Radius standar per mode matching. */
export const INTRA_CLUSTER_RADIUS_KM = 5;
export const INTRA_PROVINCE_RADIUS_KM = 15;
export const BORDERLINE_BUFFER_KM_MIN = 30;
export const BORDERLINE_BUFFER_KM_MAX = 50;
export const BORDERLINE_BUFFER_KM_DEFAULT = 40;

export const BORDER_SURCHARGE_LOW = 5_000;
export const BORDER_SURCHARGE_HIGH = 10_000;

export type RideMatchingContext = {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  pickupProvinceId: number | null;
  pickupProvinceName: string | null;
  hasOfficialBranch: boolean;
  serviceCityId: string | null;
  serviceCityName: string | null;
  operationalClusterId: string | null;
  matchingMode: RideMatchingMode | null;
  isBorderlineCrossing: boolean;
  borderSurcharge: number;
  available: boolean;
  message?: string;
};

/** Normalisasi nama provinsi untuk lookup tabel `provinces`. */
function normalizeProvinceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^provinsi\s+/i, "")
    .replace(/^prov\.\s*/i, "")
    .replace(/\s+/g, " ");
}

/**
 * Resolve provinsi jemput dari koordinat:
 * 1. Zona layanan resmi (service_cities) jika ada
 * 2. Reverse geocode → cocokkan nama ke tabel provinces
 */
export async function resolvePickupProvinceId(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<{ provinceId: number | null; provinceName: string | null }> {
  const cities = await loadActiveServiceCities(admin);
  const hit = findCityForCoords(cities, lat, lng);
  if (hit) {
    const { data: sc } = await admin
      .from("service_cities")
      .select("province_id, provinces(name)")
      .eq("id", hit.id)
      .maybeSingle();

    const provJoin = sc?.provinces as { name: string } | { name: string }[] | null;
    const provName = Array.isArray(provJoin) ? provJoin[0]?.name : provJoin?.name;

    return {
      provinceId: (sc?.province_id as number | null) ?? null,
      provinceName: provName ?? null,
    };
  }

  const geo = await reverseGeocodeCoords(lat, lng);
  if (!geo?.label) return { provinceId: null, provinceName: null };

  const parts = geo.label.split(",").map((p) => p.trim());
  const { data: provinces } = await admin.from("provinces").select("id, name");

  for (let i = parts.length - 1; i >= 0; i--) {
    const partNorm = normalizeProvinceName(parts[i]);
    const match = (provinces ?? []).find((p) => {
      const n = normalizeProvinceName(p.name as string);
      return n === partNorm || n.includes(partNorm) || partNorm.includes(n);
    });
    if (match) {
      return { provinceId: match.id as number, provinceName: match.name as string };
    }
  }

  return { provinceId: null, provinceName: null };
}

/** Hitung biaya lintas wilayah Rp 5.000 (dekat) – Rp 10.000 (jauh). */
export function computeBorderSurcharge(
  mode: RideMatchingMode | null,
  nearestDriverDistanceKm?: number | null
): number {
  if (mode !== "borderline") return 0;
  const d = nearestDriverDistanceKm ?? BORDERLINE_BUFFER_KM_DEFAULT;
  if (d <= 35) return BORDER_SURCHARGE_LOW;
  return BORDER_SURCHARGE_HIGH;
}

/**
 * Evaluasi konteks matching customer — radius GPS ketat 3 km dari titik jemput.
 * Driver di luar 3 km (meski satu provinsi) tidak diizinkan menerima order.
 */
export async function evaluateRideMatchingContext(
  admin: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number,
  serviceType: "NGOJEK" | "NGOMOBIL" = "NGOJEK"
): Promise<RideMatchingContext> {
  const pickupSvc = await checkServiceAvailability(admin, pickupLat, pickupLng);
  const destSvc = await checkServiceAvailability(admin, destLat, destLng);

  const hasOfficialBranch = Boolean(pickupSvc.available && pickupSvc.cityId);
  const clusterId = await resolveClusterIdForCoords(admin, pickupLat, pickupLng);

  const { provinceId, provinceName } = await resolvePickupProvinceId(
    admin,
    pickupLat,
    pickupLng
  );

  const destProvince = await resolvePickupProvinceId(admin, destLat, destLng);

  if (
    hasOfficialBranch &&
    destSvc.available &&
    pickupSvc.cityId &&
    destSvc.cityId &&
    pickupSvc.cityId !== destSvc.cityId &&
    !clusterId
  ) {
    return {
      pickupLat,
      pickupLng,
      destLat,
      destLng,
      pickupProvinceId: provinceId,
      pickupProvinceName: provinceName,
      hasOfficialBranch,
      serviceCityId: pickupSvc.cityId,
      serviceCityName: pickupSvc.cityName,
      operationalClusterId: clusterId,
      matchingMode: null,
      isBorderlineCrossing: false,
      borderSurcharge: 0,
      available: false,
      message: "Jemput dan tujuan harus dalam wilayah layanan yang sama",
    };
  }

  const drivers = await findCustomerNearbyDrivers(admin, {
    lat: pickupLat,
    lng: pickupLng,
    requestedService: serviceType,
    limit: 1,
  });

  if (!drivers.length) {
    return {
      pickupLat,
      pickupLng,
      destLat,
      destLng,
      pickupProvinceId: provinceId,
      pickupProvinceName: provinceName,
      hasOfficialBranch,
      serviceCityId: pickupSvc.cityId,
      serviceCityName: pickupSvc.cityName,
      operationalClusterId: clusterId,
      matchingMode: null,
      isBorderlineCrossing: false,
      borderSurcharge: 0,
      available: false,
      message: EMPTY_DRIVER_ZONE_MESSAGE,
    };
  }

  if (
    destProvince.provinceId != null &&
    provinceId != null &&
    destProvince.provinceId !== provinceId &&
    hasOfficialBranch
  ) {
    const crossDestKm = haversineKm(pickupLat, pickupLng, destLat, destLng);
    if (crossDestKm > INTRA_PROVINCE_RADIUS_KM * 2) {
      return {
        pickupLat,
        pickupLng,
        destLat,
        destLng,
        pickupProvinceId: provinceId,
        pickupProvinceName: provinceName,
        hasOfficialBranch,
        serviceCityId: pickupSvc.cityId,
        serviceCityName: pickupSvc.cityName,
        operationalClusterId: clusterId,
        matchingMode: "customer_proximity",
        isBorderlineCrossing: false,
        borderSurcharge: 0,
        available: false,
        message: "Tujuan di luar provinsi jemput untuk layanan ini",
      };
    }
  }

  return {
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    pickupProvinceId: provinceId,
    pickupProvinceName: provinceName,
    hasOfficialBranch,
    serviceCityId: pickupSvc.cityId,
    serviceCityName: pickupSvc.cityName,
    operationalClusterId: clusterId,
    matchingMode: "customer_proximity",
    isBorderlineCrossing: false,
    borderSurcharge: 0,
    available: true,
  };
}

/**
 * Pencarian driver terdekat untuk customer NGOJEK/NGOMOBIL — radius GPS ketat 3 km.
 */
export async function findTransitPriorityDrivers(
  admin: SupabaseClient,
  opts: {
    lat: number;
    lng: number;
    pickupProvinceId?: number | null;
    hasOfficialBranch?: boolean;
    operationalClusterId?: string | null;
    skipDriverIds?: string[];
    limit?: number;
    requestedService?: "NGOJEK" | "NGOMOBIL";
    packageVolumeCm3?: number;
    borderlineBufferKm?: number;
  }
): Promise<PriorityDriverMatchRow[]> {
  const rows = await findCustomerNearbyDrivers(admin, {
    lat: opts.lat,
    lng: opts.lng,
    skipDriverIds: opts.skipDriverIds,
    limit: opts.limit,
    requestedService: opts.requestedService,
    packageVolumeCm3: opts.packageVolumeCm3,
  });

  return rows.map((row) => ({
    ...row,
    match_mode: "customer_proximity" as RideMatchingMode,
    driver_province_id: null,
    is_borderline: false,
  }));
}

/** Adapter ke ServiceAvailability untuk kompatibilitas form booking. */
export function matchingContextToServiceArea(
  ctx: RideMatchingContext
): ServiceAvailability {
  return {
    available: ctx.available,
    message: ctx.message,
    cityId: ctx.serviceCityId ?? ctx.operationalClusterId,
    cityName: ctx.serviceCityName ?? ctx.pickupProvinceName,
  };
}
