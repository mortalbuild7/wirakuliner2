import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import { createClient } from "@/lib/supabase/server";

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
};

export type ProvinceOption = { id: number; name: string };
export type CityOption = { id: number; name: string; provinceId: number };

export type LiveMapFilters = {
  provinceId?: number | null;
  cityId?: number | null;
};

/** Ambil driver dengan koordinat GPS untuk peta live — scoped per tier admin. */
export async function fetchLiveDriverPins(
  session: RegionalAdminSession,
  filters: LiveMapFilters = {}
): Promise<LiveDriverPin[]> {
  const supabase = await createClient();

  let query = supabase
    .from("drivers")
    .select(
      "id, name, status, current_lat, current_lng, vehicle_plate, service_category, city_id, province_id"
    )
    .not("current_lat", "is", null)
    .not("current_lng", "is", null)
    .neq("status", "offline");

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
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
    .map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      lat: Number(d.current_lat),
      lng: Number(d.current_lng),
      vehiclePlate: d.vehicle_plate,
      serviceCategory: d.service_category,
      cityId: d.city_id,
      provinceId: d.province_id,
    }));
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
