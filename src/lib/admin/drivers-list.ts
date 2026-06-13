import "server-only";

import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import {
  getIndonesiaProvinceById,
  INDONESIA_PROVINCES,
  type IndonesiaProvince,
} from "@/app/utils/indonesiaProvinces";
import { ensureProvinceRowInDb } from "@/lib/regional-city-resolve";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Driver } from "@/types/database";

export { resolveDriverCityLabel } from "@/lib/admin/drivers-list-display";

export type AdminDriverRegionFilter = "all" | "scoped";

export type AdminDriverListQuery = {
  /** SUPER_ADMIN: default seluruh Indonesia. */
  regionFilter?: AdminDriverRegionFilter;
  /** Filter opsional provinsi (ID aplikasi 1–38). */
  provinceId?: number | null;
  /** Filter opsional kota (integer `cities.id`). */
  cityId?: number | null;
  /** Kata kunci: telepon atau NIK. */
  search?: string;
};

type EmbedName = { name: string } | { name: string }[] | null;

export type AdminDriverRow = Driver & {
  profiles: { email: string | null; account_status?: string | null; phone?: string | null } | null;
  service_cities?: EmbedName;
  registration_sc?: EmbedName;
  cities?: EmbedName;
};

export type DriverFilterCityOption = {
  id: number;
  name: string;
  province_id: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScopedDriversQuery = any;

const DRIVER_SELECT = `
  *,
  profiles(email, account_status, phone),
  service_cities:service_city_id(name),
  registration_sc:registration_service_city_id(name),
  cities:city_id(name)
`;

function sanitizeIlikeKeyword(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "").slice(0, 32);
}

export async function resolveProvinceIdsByAppId(
  appProvinceId: number
): Promise<number[]> {
  const admin = createAdminClient();
  const ids = new Set<number>();

  const ensured = await ensureProvinceRowInDb(admin, appProvinceId);
  if (ensured.ok) ids.add(ensured.dbProvinceId);

  const meta = getIndonesiaProvinceById(appProvinceId);
  if (meta) {
    const { data } = await admin
      .from("provinces")
      .select("id")
      .ilike("name", meta.name);
    for (const row of data ?? []) {
      if (row.id != null) ids.add(row.id);
    }
  }

  if (ids.size === 0) ids.add(appProvinceId);
  return [...ids];
}

async function resolveProvinceIdsForSession(
  session: RegionalAdminSession
): Promise<number[]> {
  if (session.provinceId == null) return [];
  return resolveProvinceIdsByAppId(session.provinceId);
}

/**
 * RBAC — CITY_ADMIN selalu terkunci `city_id`; PROVINCE_ADMIN by provinsi;
 * SUPER_ADMIN default tanpa filter wilayah.
 */
async function applyDriverListRegionalScope(
  query: ScopedDriversQuery,
  session: RegionalAdminSession,
  filters: AdminDriverListQuery
): Promise<ScopedDriversQuery> {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }

  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    const provinceIds = await resolveProvinceIdsForSession(session);
    if (provinceIds.length === 1) {
      return query.eq("province_id", provinceIds[0]);
    }
    return query.in("province_id", provinceIds);
  }

  if (session.adminRole === "SUPER_ADMIN") {
    if (filters.cityId != null && filters.cityId > 0) {
      return query.eq("city_id", filters.cityId);
    }
    if (filters.provinceId != null && filters.provinceId > 0) {
      const provinceIds = await resolveProvinceIdsByAppId(filters.provinceId);
      if (provinceIds.length === 1) {
        return query.eq("province_id", provinceIds[0]);
      }
      return query.in("province_id", provinceIds);
    }
    return query;
  }

  return query;
}

function applyDriverSearchFilter(
  query: ScopedDriversQuery,
  search?: string,
  phoneOnly = false
): ScopedDriversQuery {
  const keyword = sanitizeIlikeKeyword(search ?? "");
  if (!keyword) return query;

  const pattern = `%${keyword}%`;
  if (phoneOnly) return query.ilike("phone", pattern);
  return query.or(`phone.ilike.${pattern},nik.ilike.${pattern}`);
}

function isMissingNikColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("nik") && (lower.includes("column") || lower.includes("does not exist"));
}

export type FetchAdminDriversResult = {
  drivers: AdminDriverRow[];
  error?: string;
  regionFilter: AdminDriverRegionFilter;
};

/**
 * Muat daftar driver — service role + RBAC tier admin.
 */
export async function fetchAdminDriversList(
  session: RegionalAdminSession,
  query: AdminDriverListQuery = {}
): Promise<FetchAdminDriversResult> {
  const regionFilter: AdminDriverRegionFilter =
    query.regionFilter ??
    (session.adminRole === "SUPER_ADMIN" ? "all" : "scoped");

  const admin = createAdminClient();
  let dbQuery = admin
    .from("drivers")
    .select(DRIVER_SELECT)
    .order("created_at", { ascending: false });

  const applyScope =
    session.adminRole !== "SUPER_ADMIN" || regionFilter !== "all";

  if (applyScope || query.provinceId || query.cityId) {
    dbQuery = await applyDriverListRegionalScope(dbQuery, session, query);
  }

  dbQuery = applyDriverSearchFilter(dbQuery, query.search);

  let { data, error } = await dbQuery;

  if (error && query.search && isMissingNikColumnError(error.message)) {
    let retryQuery = admin
      .from("drivers")
      .select(DRIVER_SELECT)
      .order("created_at", { ascending: false });

    if (applyScope || query.provinceId || query.cityId) {
      retryQuery = await applyDriverListRegionalScope(retryQuery, session, query);
    }
    retryQuery = applyDriverSearchFilter(retryQuery, query.search, true);
    ({ data, error } = await retryQuery);
  }

  console.log("Daftar Driver Terambil:", {
    count: data?.length ?? 0,
    regionFilter,
    adminRole: session.adminRole,
    filters: query,
    error: error?.message ?? null,
    sample: data?.slice(0, 3),
  });

  if (error) {
    return { drivers: [], error: error.message, regionFilter };
  }

  return { drivers: (data ?? []) as AdminDriverRow[], regionFilter };
}

/** Opsi provinsi untuk filter SUPER_ADMIN. */
export function getDriverFilterProvinces(): readonly IndonesiaProvince[] {
  return INDONESIA_PROVINCES;
}

/** Kota dari tabel `cities` — untuk dropdown filter SUPER_ADMIN. */
export async function fetchDriverFilterCities(
  appProvinceId?: number | null
): Promise<{ cities: DriverFilterCityOption[]; error?: string }> {
  const admin = createAdminClient();
  let dbQuery = admin
    .from("cities")
    .select("id, name, province_id")
    .order("name");

  if (appProvinceId != null && appProvinceId > 0) {
    const provinceIds = await resolveProvinceIdsByAppId(appProvinceId);
    dbQuery = dbQuery.in("province_id", provinceIds);
  }

  const { data, error } = await dbQuery;
  if (error) return { cities: [], error: error.message };
  return { cities: (data ?? []) as DriverFilterCityOption[] };
}

/** Muat kota layanan aktif untuk form edit — ter-scope regional. */
export async function fetchAdminDriverServiceCities(
  session: RegionalAdminSession
) {
  const admin = createAdminClient();
  let dbQuery = admin
    .from("service_cities")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    dbQuery = dbQuery.eq("city_id", session.cityId);
  } else if (
    session.adminRole === "PROVINCE_ADMIN" &&
    session.provinceId != null
  ) {
    const provinceIds = await resolveProvinceIdsForSession(session);
    dbQuery = dbQuery.in("province_id", provinceIds);
  }

  const { data, error } = await dbQuery;
  if (error) return { cities: [], error: error.message };
  return { cities: data ?? [] };
}
