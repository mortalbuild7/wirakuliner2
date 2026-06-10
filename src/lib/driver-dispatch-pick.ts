import type { SupabaseClient } from "@supabase/supabase-js";
import { isTransitOrder } from "@/lib/order-channel";
import type { ServiceType } from "@/lib/service-types";

/** Radius pencarian driver idle di sekitar titik order (km). */
export const DISPATCH_SEARCH_RADIUS_KM = 15;

export type PriorityDriverRow = {
  driver_id: string;
  distance_km: number;
  priority_score: number;
  completion_rate: number;
  acceptance_rate: number;
  average_rating: number;
  service_category?: string;
};

/** Titik referensi jarak dispatch: jemput NGOJEK atau lokasi merchant. */
export async function resolveDispatchOrigin(
  admin: SupabaseClient,
  orderId: string
): Promise<{
  lat: number;
  lng: number;
  serviceCityId: string | null;
} | null> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, delivery_address, delivery_lat, delivery_lng, pickup_lat, pickup_lng, service_city_id, service_type, total_volume_cm3, merchant_id, merchants(latitude, longitude)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  if (isTransitOrder(order.delivery_address ?? "") || order.service_type) {
    const lat = order.pickup_lat ?? order.delivery_lat;
    const lng = order.pickup_lng ?? order.delivery_lng;
    if (lat == null || lng == null) return null;
    return {
      lat: Number(lat),
      lng: Number(lng),
      serviceCityId: order.service_city_id ?? null,
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
    };
  }

  if (order.delivery_lat != null && order.delivery_lng != null) {
    return {
      lat: Number(order.delivery_lat),
      lng: Number(order.delivery_lng),
      serviceCityId: order.service_city_id ?? null,
    };
  }

  return null;
}

/**
 * RPC `find_nearest_priority_drivers_v2` — filter kategori kendaraan + KPI.
 * Indeks 0 = driver KPI terbaik dalam radius untuk jenis layanan yang diminta.
 */
export async function findPriorityDrivers(
  admin: SupabaseClient,
  opts: {
    lat: number;
    lng: number;
    maxRadiusKm?: number;
    skipDriverIds?: string[];
    serviceCityId?: string | null;
    limit?: number;
    offerTimeoutSeconds?: number;
    requestedService?: ServiceType;
    packageVolumeCm3?: number;
  }
): Promise<PriorityDriverRow[]> {
  const service: ServiceType = opts.requestedService ?? "NGOJEK";

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

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PriorityDriverRow[];
}

/** Ambil service_type & volume dari order untuk dispatch v2. */
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
