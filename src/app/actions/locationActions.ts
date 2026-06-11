"use server";

import { verifyAdminSession } from "@/app/utils/adminAuth";
import { INDONESIA_PROVINCE_IDS } from "@/app/utils/indonesiaProvinces";
import { createAdminClient } from "@/lib/supabase/admin";

/** Opsi kota cabang aktif — terhubung ke zona layanan GPS (service_cities). */
export type ActiveCityOption = {
  cityId: number;
  name: string;
  provinceId: number;
  serviceCityId: string;
};

export type ActiveCitiesResult =
  | { ok: true; cities: ActiveCityOption[] }
  | { ok: false; error: string };

/**
 * Memuat kota referensi aktif per provinsi — sumber dropdown "Kota Cabang" form driver.
 *
 * Filter ketat:
 * - `cities.province_id` = provinceId yang dipilih admin
 * - `cities.is_active` = true
 * - Hanya kota yang punya `service_cities` aktif (zona operasional siap rekrutmen)
 *
 * Memakai service role agar tidak terblokir RLS — konsisten dengan Manajemen Kota.
 */
export async function getActiveCitiesByProvince(
  provinceId: number
): Promise<ActiveCitiesResult> {
  const session = await verifyAdminSession();

  const pid = Number(provinceId);
  if (!Number.isInteger(pid) || pid <= 0 || !INDONESIA_PROVINCE_IDS.has(pid)) {
    return { ok: false, error: "Provinsi tidak valid" };
  }

  if (
    session.adminRole === "PROVINCE_ADMIN" &&
    session.provinceId != null &&
    session.provinceId !== pid
  ) {
    return { ok: false, error: "Provinsi di luar yurisdiksi Anda" };
  }

  const admin = createAdminClient();

  let citiesQuery = admin
    .from("cities")
    .select("id, name, province_id")
    .eq("province_id", pid)
    .eq("is_active", true)
    .order("name");

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    citiesQuery = citiesQuery.eq("id", session.cityId);
  }

  const { data: cities, error: citiesErr } = await citiesQuery;

  if (citiesErr) {
    return { ok: false, error: citiesErr.message };
  }

  if (!cities?.length) {
    return { ok: true, cities: [] };
  }

  const cityIds = cities.map((c) => c.id);

  const { data: serviceCities, error: scErr } = await admin
    .from("service_cities")
    .select("id, city_id, province_id")
    .eq("province_id", pid)
    .eq("is_active", true)
    .in("city_id", cityIds);

  if (scErr) {
    return { ok: false, error: scErr.message };
  }

  const scByCityId = new Map(
    (serviceCities ?? []).map((sc) => [sc.city_id, sc] as const)
  );

  const result: ActiveCityOption[] = [];
  for (const city of cities) {
    const zone = scByCityId.get(city.id);
    if (zone) {
      result.push({
        cityId: city.id,
        name: city.name,
        provinceId: city.province_id,
        serviceCityId: zone.id,
      });
    }
  }

  return { ok: true, cities: result };
}
