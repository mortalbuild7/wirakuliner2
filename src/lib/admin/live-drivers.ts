import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { resolveClusterForServiceCity } from "@/lib/operational-cluster";

export type LiveDriverPin = {
  id: string;
  name: string;
  status: string;
  lat: number;
  lng: number;
  vehiclePlate: string | null;
  serviceCategory: string | null;
  cityId: number | null;
  provinceId: number | null;
  operationalClusterId: string | null;
  registrationServiceCityId: string | null;
  clusterName?: string | null;
};

export type ProvinceOption = { id: number; name: string };
export type CityOption = { id: number; name: string; provinceId: number };

export type LiveMapFilters = {
  provinceId?: number | null;
  cityId?: number | null;
  /** Peta cluster — tampilkan semua driver dalam cluster operasional. */
  clusterMode?: boolean;
};

async function resolveAdminClusterId(
  session: RegionalAdminSession
): Promise<string | null> {
  if (session.adminRole !== "CITY_ADMIN" || session.cityId == null) return null;

  const supabase = await createClient();
  const { data: sc } = await supabase
    .from("service_cities")
    .select("id, operational_cluster_id")
    .eq("city_id", session.cityId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (sc?.operational_cluster_id) return sc.operational_cluster_id as string;
  if (sc?.id) {
    const admin = await import("@/lib/supabase/admin").then((m) => m.createAdminClient());
    return resolveClusterForServiceCity(admin, sc.id as string);
  }
  return null;
}

/**
 * Pin driver untuk peta live.
 * - clusterMode: semua driver dalam cluster operasional (fluid Jabodetabek)
 * - default laporan: filter registration / city_id untuk City Admin
 */
export async function fetchLiveDriverPins(
  session: RegionalAdminSession,
  filters: LiveMapFilters = {}
): Promise<LiveDriverPin[]> {
  const supabase = await createClient();
  const clusterMode = filters.clusterMode ?? true;

  let query = supabase
    .from("drivers")
    .select(
      "id, name, status, current_lat, current_lng, vehicle_plate, service_category, city_id, province_id, operational_cluster_id, registration_service_city_id, operational_clusters(name)"
    )
    .not("current_lat", "is", null)
    .not("current_lng", "is", null)
    .neq("status", "offline");

  if (clusterMode && session.adminRole === "CITY_ADMIN") {
    const clusterId = await resolveAdminClusterId(session);
    if (clusterId) {
      query = query.eq("operational_cluster_id", clusterId);
    } else if (session.cityId != null) {
      query = query.eq("city_id", session.cityId);
    }
  } else if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    query = query.eq("city_id", session.cityId);
  } else if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    query = query.eq("province_id", session.provinceId);
    if (filters.cityId != null) {
      query = query.eq("city_id", filters.cityId);
    }
  } else if (session.adminRole === "SUPER_ADMIN") {
    if (filters.provinceId != null) {
      query = query.eq("province_id", filters.provinceId);
    }
    if (filters.cityId != null) {
      query = query.eq("city_id", filters.cityId);
    }
  }

  const { data } = await query.limit(500);

  return (data ?? [])
    .filter((d) => d.current_lat != null && d.current_lng != null)
    .map((d) => {
      const clusterJoin = d.operational_clusters as
        | { name: string }
        | { name: string }[]
        | null;
      const clusterName = Array.isArray(clusterJoin)
        ? clusterJoin[0]?.name
        : clusterJoin?.name;

      return {
        id: d.id,
        name: d.name,
        status: d.status,
        lat: Number(d.current_lat),
        lng: Number(d.current_lng),
        vehiclePlate: d.vehicle_plate,
        serviceCategory: d.service_category,
        cityId: d.city_id,
        provinceId: d.province_id,
        operationalClusterId: d.operational_cluster_id as string | null,
        registrationServiceCityId: d.registration_service_city_id as string | null,
        clusterName: clusterName ?? null,
      };
    });
}

export async function fetchProvinceOptions(
  session: RegionalAdminSession
): Promise<ProvinceOption[]> {
  const supabase = await createClient();

  if (session.adminRole === "SUPER_ADMIN") {
    const { data } = await supabase.from("provinces").select("id, name").order("name");
    return data ?? [];
  }

  if (session.provinceId != null) {
    const { data } = await supabase
      .from("provinces")
      .select("id, name")
      .eq("id", session.provinceId)
      .maybeSingle();
    return data ? [data] : [];
  }

  return [];
}

export async function fetchCityOptions(
  session: RegionalAdminSession,
  provinceId: number | null
): Promise<CityOption[]> {
  const supabase = await createClient();
  const pid =
    session.adminRole === "PROVINCE_ADMIN"
      ? session.provinceId
      : provinceId;

  if (pid == null) return [];

  const { data } = await supabase
    .from("cities")
    .select("id, name, province_id")
    .eq("province_id", pid)
    .order("name");

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return (data ?? [])
      .filter((c) => c.id === session.cityId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        provinceId: c.province_id,
      }));
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    provinceId: c.province_id,
  }));
}
