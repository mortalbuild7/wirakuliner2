import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/geo-config";

export const SERVICE_UNAVAILABLE_MSG =
  "Layanan ini masih belum tersedia diwilayah anda";

export type ServiceCity = {
  id: string;
  name: string;
  slug: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
};

export type ServiceAvailability = {
  available: boolean;
  message?: string;
  cityId: string | null;
  cityName: string | null;
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadActiveServiceCities(
  admin: SupabaseClient
): Promise<ServiceCity[]> {
  const { data } = await admin
    .from("service_cities")
    .select("id, name, slug, center_lat, center_lng, radius_km, is_active")
    .eq("is_active", true)
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    center_lat: toNum(row.center_lat),
    center_lng: toNum(row.center_lng),
    radius_km: toNum(row.radius_km),
    is_active: Boolean(row.is_active),
  }));
}

/** Kota terdekat yang mencakup koordinat (dalam radius). */
export function findCityForCoords(
  cities: ServiceCity[],
  lat: number,
  lng: number
): ServiceCity | null {
  let best: ServiceCity | null = null;
  let bestDist = Infinity;

  for (const city of cities) {
    const dist = haversineKm(lat, lng, city.center_lat, city.center_lng);
    if (dist <= city.radius_km && dist < bestDist) {
      best = city;
      bestDist = dist;
    }
  }

  return best;
}

/** Cek wilayah aktif dan ada driver terdaftar di kota tersebut. */
export async function checkServiceAvailability(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<ServiceAvailability> {
  const cities = await loadActiveServiceCities(admin);
  const city = findCityForCoords(cities, lat, lng);

  if (!city) {
    return {
      available: false,
      message: SERVICE_UNAVAILABLE_MSG,
      cityId: null,
      cityName: null,
    };
  }

  const { count } = await admin
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .eq("service_city_id", city.id);

  if (!count || count === 0) {
    return {
      available: false,
      message: SERVICE_UNAVAILABLE_MSG,
      cityId: city.id,
      cityName: city.name,
    };
  }

  return {
    available: true,
    cityId: city.id,
    cityName: city.name,
  };
}

/** Validasi pesanan kuliner: lokasi antar + merchant di kota yang sama. */
export async function checkFoodServiceAvailability(
  admin: SupabaseClient,
  merchant: {
    service_city_id?: string | null;
    latitude: number;
    longitude: number;
  },
  deliveryLat: number,
  deliveryLng: number,
  dineIn: boolean
): Promise<ServiceAvailability> {
  const anchorLat = dineIn ? merchant.latitude : deliveryLat;
  const anchorLng = dineIn ? merchant.longitude : deliveryLng;

  const area = await checkServiceAvailability(admin, anchorLat, anchorLng);
  if (!area.available) return area;

  if (
    merchant.service_city_id &&
    area.cityId &&
    merchant.service_city_id !== area.cityId
  ) {
    return {
      available: false,
      message: SERVICE_UNAVAILABLE_MSG,
      cityId: area.cityId,
      cityName: area.cityName,
    };
  }

  return area;
}
