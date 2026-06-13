"use server";

import { verifyAdminSession } from "@/app/utils/adminAuth";
import {
  getIndonesiaProvinceById,
  INDONESIA_PROVINCE_IDS,
} from "@/app/utils/indonesiaProvinces";
import { isCityInProvince } from "@/lib/indonesia-regions";
import { createAdminClient } from "@/lib/supabase/admin";

/** Opsi kota cabang aktif — terhubung ke zona layanan GPS (service_cities). */
export type ActiveCityOption = {
  cityId: number;
  name: string;
  provinceId: number;
  serviceCityId: string;
};

/** Opsi kota untuk rekrutmen admin — sumber sama: service_cities aktif. */
export type RecruitCityOption = {
  cityId: number;
  name: string;
  provinceId: number;
  serviceCityId: string;
};

export type ActiveCitiesResult =
  | { ok: true; cities: ActiveCityOption[] }
  | { ok: false; error: string };

export type RecruitCitiesResult =
  | { ok: true; cities: RecruitCityOption[]; source: "database" }
  | { ok: false; error: string };

type ServiceCityRow = {
  id: string;
  name: string;
  province_id: number | null;
  city_id: number | null;
  provinces?: { name: string } | { name: string }[] | null;
};

/**
 * Muat zona layanan aktif per provinsi — sumber tunggal dropdown pendaftaran.
 * Query langsung ke `service_cities` (tanpa API eksternal).
 */
async function loadServiceCitiesForProvince(
  provinceId: number
): Promise<{ rows: ServiceCityRow[]; error?: string }> {
  const admin = createAdminClient();
  const provinceMeta = getIndonesiaProvinceById(provinceId);
  const provinceIds = new Set<number>([provinceId]);

  if (provinceMeta) {
    const { data: matchedProvinces } = await admin
      .from("provinces")
      .select("id, name")
      .ilike("name", provinceMeta.name);

    for (const row of matchedProvinces ?? []) {
      if (row.id != null) provinceIds.add(row.id);
    }
  }

  const { data, error } = await admin
    .from("service_cities")
    .select("id, name, province_id, city_id, is_active, provinces(name)")
    .eq("is_active", true)
    .in("province_id", [...provinceIds])
    .order("name");

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: (data ?? []) as ServiceCityRow[] };
}

function mapToActiveOptions(
  rows: ServiceCityRow[],
  selectedProvinceId: number
): ActiveCityOption[] {
  const options: ActiveCityOption[] = [];

  for (const row of rows) {
    if (row.city_id == null) continue;
    options.push({
      cityId: row.city_id,
      name: row.name,
      provinceId: selectedProvinceId,
      serviceCityId: row.id,
    });
  }

  return options;
}

/**
 * Dropdown "Kota Cabang" — form driver & merchant admin.
 * Hanya kota yang ada di `service_cities` aktif untuk provinsi terpilih.
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

  const { rows, error } = await loadServiceCitiesForProvince(pid);
  if (error) {
    return { ok: false, error };
  }

  let cities = mapToActiveOptions(rows, pid);

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    cities = cities.filter((c) => c.cityId === session.cityId);
  }

  return { ok: true, cities };
}

/**
 * Dropdown kota — form rekrutmen City Admin.
 * Sumber identik: `service_cities` aktif per provinsi.
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
  const { rows, error } = await loadServiceCitiesForProvince(pid);
  if (error) {
    return { ok: false, error };
  }

  let cities: RecruitCityOption[] = mapToActiveOptions(rows, pid).map((c) => ({
    cityId: c.cityId,
    name: c.name,
    provinceId: c.provinceId,
    serviceCityId: c.serviceCityId,
  }));

  if (!cities.length) {
    return {
      ok: false,
      error: provinceMeta
        ? `Belum ada kota layanan aktif di ${provinceMeta.name}. Tambahkan di Manajemen Kota Layanan.`
        : "Belum ada kota layanan aktif untuk provinsi ini.",
    };
  }

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    cities = cities.filter((c) => c.cityId === session.cityId);
  }

  return { ok: true, cities, source: "database" };
}

/** Pastikan kota yang dipilih benar-benar milik provinsi yang dipilih (master lokal). */
export async function isRecruitCityInProvince(
  provinceId: number,
  _cityId: number | null,
  cityName?: string
): Promise<boolean> {
  if (!cityName?.trim()) return false;
  return isCityInProvince(provinceId, cityName);
}
