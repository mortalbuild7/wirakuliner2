import type { SupabaseClient } from "@supabase/supabase-js";
import { isNgojekOrder } from "@/lib/order-channel";

/** Radius pencarian driver idle di sekitar titik order (km). */
export const DISPATCH_SEARCH_RADIUS_KM = 15;

export type PriorityDriverRow = {
  driver_id: string;
  distance_km: number;
  priority_score: number;
  completion_rate: number;
  acceptance_rate: number;
  average_rating: number;
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
      "id, delivery_address, delivery_lat, delivery_lng, pickup_lat, pickup_lng, service_city_id, merchant_id, merchants(latitude, longitude)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  if (isNgojekOrder(order.delivery_address ?? "")) {
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
 * RPC `find_nearest_priority_drivers` — hasil ORDER BY priority_score DESC.
 * Indeks 0 = driver KPI terbaik dalam radius.
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
  }
): Promise<PriorityDriverRow[]> {
  const { data, error } = await admin.rpc("find_nearest_priority_drivers", {
    lat_customer: opts.lat,
    lng_customer: opts.lng,
    max_radius_km: opts.maxRadiusKm ?? DISPATCH_SEARCH_RADIUS_KM,
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
