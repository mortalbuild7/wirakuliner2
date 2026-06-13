import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIndonesiaProvinceById } from "@/app/utils/indonesiaProvinces";
import {
  findCityInProvince,
  isCityInProvince,
} from "@/lib/indonesia-regions";
import { normalizeCityNameForDedup } from "@/lib/wilayah-city-format";

type ServiceCityRow = {
  id: string;
  name: string;
  province_id: number | null;
  city_id: number | null;
  operational_cluster_id?: string | null;
};

function cityLabelFromServiceRow(name: string): string {
  return (name.split(",")[0] ?? name).trim();
}

/**
 * Sinkronkan baris `provinces` dan kembalikan ID efektif di database.
 * Form memakai ID aplikasi (1–38); DB bisa memakai ID Kemendagri (mis. Jawa Barat = 31).
 * Upsert `onConflict: name` memastikan FK `cities.province_id` selalu valid.
 */
export async function ensureProvinceRowInDb(
  admin: SupabaseClient,
  appProvinceId: number
): Promise<
  | { ok: true; dbProvinceId: number; provinceName: string }
  | { ok: false; error: string }
> {
  const meta = getIndonesiaProvinceById(appProvinceId);
  if (!meta) {
    return { ok: false, error: "Provinsi tidak valid" };
  }

  const { data: province, error } = await admin
    .from("provinces")
    .upsert({ id: meta.id, name: meta.name }, { onConflict: "name" })
    .select("id, name")
    .single();

  if (error || !province) {
    return {
      ok: false,
      error: error?.message ?? "Gagal menyimpan provinsi induk",
    };
  }

  return {
    ok: true,
    dbProvinceId: province.id,
    provinceName: province.name,
  };
}

async function provinceIdAliases(provinceId: number): Promise<Set<number>> {
  const ids = new Set<number>([provinceId]);
  const meta = getIndonesiaProvinceById(provinceId);
  if (!meta) return ids;

  const admin = createAdminClient();
  const { data } = await admin
    .from("provinces")
    .select("id")
    .ilike("name", meta.name);

  for (const row of data ?? []) {
    if (row.id != null) ids.add(row.id);
  }
  return ids;
}

/** Cocokkan nama kota ke baris `service_cities` aktif di provinsi. */
export async function findActiveServiceCityByName(
  provinceId: number,
  cityName: string
): Promise<ServiceCityRow | null> {
  const canonical = findCityInProvince(provinceId, cityName);
  if (!canonical) return null;

  const targetKey = normalizeCityNameForDedup(canonical);
  const admin = createAdminClient();
  const provinceIds = await provinceIdAliases(provinceId);

  const { data, error } = await admin
    .from("service_cities")
    .select("id, name, province_id, city_id, is_active, operational_cluster_id")
    .eq("is_active", true)
    .in("province_id", [...provinceIds]);

  if (error || !data?.length) return null;

  for (const row of data as ServiceCityRow[]) {
    if (row.city_id == null) continue;
    const label = cityLabelFromServiceRow(row.name);
    if (normalizeCityNameForDedup(label) === targetKey) {
      return row;
    }
  }

  return null;
}

/** Validasi kota ada di master lokal provinsi (tanpa query DB). */
export function validateCityInLocalMaster(
  provinceId: number,
  cityName: string
): { ok: true; canonicalName: string } | { ok: false; error: string } {
  if (!isCityInProvince(provinceId, cityName)) {
    return {
      ok: false,
      error: "Kota yang dipilih tidak sesuai dengan provinsi induk",
    };
  }
  const canonicalName = findCityInProvince(provinceId, cityName)!;
  return { ok: true, canonicalName };
}

/** Resolve integer `city_id` untuk profil admin — dari service_cities, cities, atau alokasi baru. */
export async function resolveCityIdForAdminProfile(
  provinceId: number,
  cityName: string
): Promise<number | null> {
  const validated = validateCityInLocalMaster(provinceId, cityName);
  if (!validated.ok) return null;

  const admin = createAdminClient();
  const prov = await ensureProvinceRowInDb(admin, provinceId);
  if (!prov.ok) return null;
  const dbProvinceId = prov.dbProvinceId;

  const serviceCity = await findActiveServiceCityByName(
    provinceId,
    validated.canonicalName
  );
  if (serviceCity?.city_id != null) return serviceCity.city_id;

  const targetKey = normalizeCityNameForDedup(validated.canonicalName);

  const { data: cityRows } = await admin
    .from("cities")
    .select("id, name")
    .eq("province_id", dbProvinceId);

  for (const row of cityRows ?? []) {
    if (normalizeCityNameForDedup(row.name) === targetKey) {
      return row.id;
    }
  }

  const { data: maxRow } = await admin
    .from("cities")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (maxRow?.id ?? 900000) + 1;
}
