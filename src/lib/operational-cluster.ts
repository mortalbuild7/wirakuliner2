import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/geo-config";

/** Radius dispatch NGOJEK / NGOMOBIL — 5000 meter. */
export const CLUSTER_DISPATCH_RADIUS_KM = 5;

export type OperationalCluster = {
  id: string;
  code: string;
  name: string;
  slug: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
};

export type ClusterAvailability = {
  available: boolean;
  message?: string;
  clusterId: string | null;
  clusterName: string | null;
};

let clusterCache: OperationalCluster[] | null = null;
let clusterCacheAt = 0;
const CLUSTER_CACHE_MS = 60_000;

/** Muat cluster aktif — cache 60 detik agar query berulang <200ms. */
export async function loadActiveOperationalClusters(
  admin: SupabaseClient
): Promise<OperationalCluster[]> {
  if (clusterCache && Date.now() - clusterCacheAt < CLUSTER_CACHE_MS) {
    return clusterCache;
  }

  const { data } = await admin
    .from("operational_clusters")
    .select("id, code, name, slug, center_lat, center_lng, radius_km, is_active")
    .eq("is_active", true)
    .order("name");

  clusterCache = (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    slug: row.slug as string,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusKm: Number(row.radius_km),
    isActive: Boolean(row.is_active),
  }));
  clusterCacheAt = Date.now();
  return clusterCache;
}

/** Tentukan cluster dari koordinat — tanpa nama kota administratif. */
export function findClusterForCoords(
  clusters: OperationalCluster[],
  lat: number,
  lng: number
): OperationalCluster | null {
  let best: OperationalCluster | null = null;
  let bestDist = Infinity;

  for (const cluster of clusters) {
    const dist = haversineKm(lat, lng, cluster.centerLat, cluster.centerLng);
    if (dist <= cluster.radiusKm && dist < bestDist) {
      best = cluster;
      bestDist = dist;
    }
  }

  return best;
}

/** RPC fallback — resolve cluster via SQL (lebih akurat setelah migrasi). */
export async function resolveClusterIdForCoords(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<string | null> {
  const { data, error } = await admin.rpc("resolve_operational_cluster_for_coords", {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    const clusters = await loadActiveOperationalClusters(admin);
    return findClusterForCoords(clusters, lat, lng)?.id ?? null;
  }

  return (data as string | null) ?? null;
}

/**
 * Cek ketersediaan layanan transit berbasis cluster.
 * Jemput & tujuan harus dalam cluster yang sama (fluid lintas kota).
 */
export async function checkClusterRideAvailability(
  admin: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number
): Promise<ClusterAvailability> {
  const pickupClusterId = await resolveClusterIdForCoords(admin, pickupLat, pickupLng);
  if (!pickupClusterId) {
    return {
      available: false,
      message: "Titik jemput di luar cluster operasional",
      clusterId: null,
      clusterName: null,
    };
  }

  const destClusterId = await resolveClusterIdForCoords(admin, destLat, destLng);
  if (!destClusterId) {
    return {
      available: false,
      message: "Tujuan di luar cluster operasional",
      clusterId: pickupClusterId,
      clusterName: null,
    };
  }

  if (pickupClusterId !== destClusterId) {
    return {
      available: false,
      message: "Jemput dan tujuan harus dalam cluster operasional yang sama",
      clusterId: pickupClusterId,
      clusterName: null,
    };
  }

  const clusters = await loadActiveOperationalClusters(admin);
  const cluster = clusters.find((c) => c.id === pickupClusterId);

  const { count } = await admin
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .eq("operational_cluster_id", pickupClusterId)
    .neq("status", "offline");

  if (!count || count === 0) {
    return {
      available: false,
      message: "Belum ada driver aktif di cluster ini",
      clusterId: pickupClusterId,
      clusterName: cluster?.name ?? null,
    };
  }

  return {
    available: true,
    clusterId: pickupClusterId,
    clusterName: cluster?.name ?? null,
  };
}

/** Cluster operasional dari service city pendaftaran driver. */
export async function resolveClusterForServiceCity(
  admin: SupabaseClient,
  serviceCityId: string
): Promise<string | null> {
  const { data } = await admin
    .from("service_cities")
    .select("operational_cluster_id")
    .eq("id", serviceCityId)
    .maybeSingle();

  return (data?.operational_cluster_id as string | null) ?? null;
}
