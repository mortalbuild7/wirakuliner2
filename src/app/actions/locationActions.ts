"use server";

import { verifyAdminSession } from "@/app/utils/adminAuth";
import {
  getIndonesiaProvinceById,
  INDONESIA_PROVINCE_IDS,
} from "@/app/utils/indonesiaProvinces";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRegenciesByProvinceName,
} from "@/lib/indonesia-wilayah-api";
import { formatWilayahCityName } from "@/lib/wilayah-city-format";

/** Opsi kota cabang aktif — terhubung ke zona layanan GPS (service_cities). */
export type ActiveCityOption = {
  cityId: number;
  name: string;
  provinceId: number;
  serviceCityId: string;
};

/** Opsi kota untuk rekrutmen admin — tidak wajib punya zona layanan aktif. */
export type RecruitCityOption = {
  cityId: number;
  name: string;
  provinceId: number;
};

export type ActiveCitiesResult =
  | { ok: true; cities: ActiveCityOption[] }
  | { ok: false; error: string };

export type RecruitCitiesResult =
  | { ok: true; cities: RecruitCityOption[]; source: "database" | "api" }
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

/**
 * Memuat kota/kabupaten untuk dropdown rekrutmen City Admin.
 *
 * Sumber utama: API EMSIFA per nama provinsi (filter geografis akurat).
 * Pelengkap: baris `cities` di DB dengan `province_id` = ID aplikasi (1–38) saja —
 * tidak mencampur ID Kemendagri agar kota provinsi lain tidak ikut terbawa.
 */
export async function getCitiesByProvinceForRecruit(
  provinceId: number
): Promise<RecruitCitiesResult> {
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

  const provinceMeta = getIndonesiaProvinceById(pid);
  if (!provinceMeta) {
    return { ok: false, error: "Provinsi tidak ditemukan" };
  }

  let cities: RecruitCityOption[] = [];

  try {
    const regencies = await fetchRegenciesByProvinceName(provinceMeta.name);
    cities = regencies.map((r) => ({
      cityId: Number(r.id),
      name: formatWilayahCityName(r.name),
      provinceId: pid,
    }));
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Gagal memuat data wilayah dari API";
    return { ok: false, error: msg };
  }

  if (!cities.length) {
    return {
      ok: false,
      error: `Tidak ada kota/kabupaten untuk ${provinceMeta.name}`,
    };
  }

  const admin = createAdminClient();
  const { data: dbCities, error: dbErr } = await admin
    .from("cities")
    .select("id, name, province_id")
    .eq("province_id", pid)
    .order("name");

  if (dbErr) {
    return { ok: false, error: dbErr.message };
  }

  const seenNames = new Set(cities.map((c) => c.name.toLowerCase()));
  for (const row of dbCities ?? []) {
    const key = row.name.toLowerCase();
    if (!seenNames.has(key)) {
      cities.push({
        cityId: row.id,
        name: row.name,
        provinceId: pid,
      });
      seenNames.add(key);
    }
  }

  cities.sort((a, b) => a.name.localeCompare(b.name, "id"));

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    const scoped = cities.filter((c) => c.cityId === session.cityId);
    return { ok: true, cities: scoped, source: "api" };
  }

  return { ok: true, cities, source: "api" };
}

/** Pastikan kota yang dipilih benar-benar milik provinsi yang dipilih. */
export async function isRecruitCityInProvince(
  provinceId: number,
  cityId: number,
  cityName?: string
): Promise<boolean> {
  const res = await getCitiesByProvinceForRecruit(provinceId);
  if (!res.ok) return false;

  const normalizedName = cityName?.trim().toLowerCase();
  return res.cities.some(
    (c) =>
      c.cityId === cityId &&
      c.provinceId === provinceId &&
      (!normalizedName || c.name.toLowerCase() === normalizedName)
  );
}
