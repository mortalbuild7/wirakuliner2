import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTransitOrder } from "@/lib/order-channel";
import { findTransitPriorityDrivers } from "@/lib/ride-matching";
import type { PriorityDriverMatchRow, RideMatchingMode } from "@/lib/ride-matching-types";
import type { ServiceType } from "@/lib/service-types";

/** Radius pencarian driver kuliner / legacy (km). */
export const DISPATCH_SEARCH_RADIUS_KM = 15;

/** @deprecated Gunakan INTRA_CLUSTER_RADIUS_KM dari ride-matching. */
export const TRANSIT_CLUSTER_DISPATCH_RADIUS_KM = 5;

export type PriorityDriverRow = PriorityDriverMatchRow & {
  match_mode?: RideMatchingMode;
};

/** Titik referensi dispatch + konteks matching provinsi/borderline. */
export async function resolveDispatchOrigin(
  admin: SupabaseClient,
  orderId: string
): Promise<{
  lat: number;
  lng: number;
  serviceCityId: string | null;
  operationalClusterId: string | null;
  pickupProvinceId: number | null;
  hasOfficialBranch: boolean;
  matchingMode: RideMatchingMode | null;
  isBorderlineCrossing: boolean;
} | null> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, delivery_address, delivery_lat, delivery_lng, pickup_lat, pickup_lng, service_city_id, operational_cluster_id, pickup_province_id, is_borderline_crossing, matching_mode, service_type, total_volume_cm3, merchant_id, merchants(latitude, longitude)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const matchingMode = (order.matching_mode as RideMatchingMode | null) ?? null;
  const isBorderline = Boolean(order.is_borderline_crossing);
  const pickupProvinceId = (order.pickup_province_id as number | null) ?? null;

  if (isTransitOrder(order.delivery_address ?? "") || order.service_type) {
    const lat = order.pickup_lat ?? order.delivery_lat;
    const lng = order.pickup_lng ?? order.delivery_lng;
    if (lat == null || lng == null) return null;

    return {
      lat: Number(lat),
      lng: Number(lng),
      serviceCityId: order.service_city_id ?? null,
      operationalClusterId: (order.operational_cluster_id as string | null) ?? null,
      pickupProvinceId,
      hasOfficialBranch:
        !isBorderline && matchingMode !== "borderline",
      matchingMode,
      isBorderlineCrossing: isBorderline,
    };
  }

  const merchant = order.merchants as
    | { latitude: number; longitude: number }
    | { latitude: number; longitude: number }[]
    | null;
  const m = Array.isArray(merchant) ? merchant[0] : merchant;
  if (m?.latitude != null && m?.longitude != null) {
    return {
      lat: Number(m.latitude),
      lng: Number(m.longitude),
      serviceCityId: order.service_city_id ?? null,
      operationalClusterId: (order.operational_cluster_id as string | null) ?? null,
      pickupProvinceId,
      hasOfficialBranch: true,
      matchingMode: null,
      isBorderlineCrossing: false,
    };
  }

  if (order.delivery_lat != null && order.delivery_lng != null) {
    return {
      lat: Number(order.delivery_lat),
      lng: Number(order.delivery_lng),
      serviceCityId: order.service_city_id ?? null,
      operationalClusterId: (order.operational_cluster_id as string | null) ?? null,
      pickupProvinceId,
      hasOfficialBranch: true,
      matchingMode: null,
      isBorderlineCrossing: false,
    };
  }

  return null;
}

/**
 * RPC dispatch v4 — intra-provinsi + borderline buffer untuk NGOJEK/NGOMOBIL.
 */
export async function findPriorityDrivers(
  admin: SupabaseClient,
  opts: {
    lat: number;
    lng: number;
    maxRadiusKm?: number;
    skipDriverIds?: string[];
    serviceCityId?: string | null;
    operationalClusterId?: string | null;
    pickupProvinceId?: number | null;
    hasOfficialBranch?: boolean;
    limit?: number;
    offerTimeoutSeconds?: number;
    requestedService?: ServiceType;
    packageVolumeCm3?: number;
  }
): Promise<PriorityDriverRow[]> {
  const service: ServiceType = opts.requestedService ?? "NGOJEK";
  const useTransitMatching = service === "NGOJEK" || service === "NGOMOBIL";

  if (useTransitMatching) {
    return findTransitPriorityDrivers(admin, {
      lat: opts.lat,
      lng: opts.lng,
      pickupProvinceId: opts.pickupProvinceId,
      hasOfficialBranch: opts.hasOfficialBranch ?? true,
      operationalClusterId: opts.operationalClusterId,
      skipDriverIds: opts.skipDriverIds,
      limit: opts.limit,
      requestedService: service,
      packageVolumeCm3: opts.packageVolumeCm3,
    });
  }

  const { data, error } = await admin.rpc("find_nearest_priority_drivers_v2", {
    lat_customer: opts.lat,
    lng_customer: opts.lng,
    max_radius_km: opts.maxRadiusKm ?? DISPATCH_SEARCH_RADIUS_KM,
    requested_service: service,
    package_volume_cm3: opts.packageVolumeCm3 ?? 0,
    p_skip_driver_ids: opts.skipDriverIds ?? [],
    p_service_city_id: opts.serviceCityId ?? null,
    p_offer_timeout_seconds: opts.offerTimeoutSeconds ?? 15,
    p_limit: opts.limit ?? 20,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as PriorityDriverRow[];
}

/** Ambil service_type & volume dari order untuk dispatch. */
export async function resolveOrderDispatchContext(
  admin: SupabaseClient,
  orderId: string
): Promise<{
  requestedService: ServiceType;
  packageVolumeCm3: number;
} | null> {
  const { data: order } = await admin
    .from("orders")
    .select("service_type, total_volume_cm3, delivery_address")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  let service = order.service_type as ServiceType | null;
  if (!service) {
    const addr = order.delivery_address ?? "";
    if (addr.startsWith("[NGOMOBIL]")) service = "NGOMOBIL";
    else if (addr.startsWith("[PAKET]")) service = "PAKET";
    else service = "NGOJEK";
  }

  return {
    requestedService: service,
    packageVolumeCm3: Number(order.total_volume_cm3 ?? 0),
  };
}
