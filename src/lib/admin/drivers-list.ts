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

async function resolveRegionalScopeFilters(
  session: RegionalAdminSession,
  filters: AdminDriverListQuery
): Promise<{ cityId?: number; provinceIds?: number[] } | null> {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return { cityId: session.cityId };
  }

  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    const provinceIds = await resolveProvinceIdsForSession(session);
    return provinceIds.length ? { provinceIds } : null;
  }

  if (session.adminRole === "SUPER_ADMIN") {
    if (filters.cityId != null && filters.cityId > 0) {
      return { cityId: filters.cityId };
    }
    if (filters.provinceId != null && filters.provinceId > 0) {
      const provinceIds = await resolveProvinceIdsByAppId(filters.provinceId);
      return provinceIds.length ? { provinceIds } : null;
    }
  }

  return null;
}

function applyRegionalScopeToQuery<
  T extends {
    eq: (column: string, value: unknown) => T;
    in: (column: string, values: readonly unknown[]) => T;
  }
>(dbQuery: T, scope: { cityId?: number; provinceIds?: number[] } | null): T {
  if (!scope) return dbQuery;
  if (scope.cityId != null) return dbQuery.eq("city_id", scope.cityId);
  if (scope.provinceIds?.length === 1) {
    return dbQuery.eq("province_id", scope.provinceIds[0]);
  }
  if (scope.provinceIds && scope.provinceIds.length > 1) {
    return dbQuery.in("province_id", scope.provinceIds);
  }
  return dbQuery;
}

function applySearchToQuery<
  T extends {
    or: (filters: string) => T;
    ilike: (column: string, pattern: string) => T;
  }
>(dbQuery: T, search?: string, phoneOnly = false): T {
  const keyword = sanitizeIlikeKeyword(search ?? "");
  if (!keyword) return dbQuery;

  const pattern = `%${keyword}%`;
  if (phoneOnly) return dbQuery.ilike("phone", pattern);
  return dbQuery.or(`phone.ilike.${pattern},nik.ilike.${pattern}`);
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
  const applyScope =
    session.adminRole !== "SUPER_ADMIN" || regionFilter !== "all";

  const scopeFilters =
    applyScope || query.provinceId || query.cityId
      ? await resolveRegionalScopeFilters(session, query)
      : null;

  let dbQuery = admin
    .from("drivers")
    .select(DRIVER_SELECT)
    .order("created_at", { ascending: false });

  dbQuery = applyRegionalScopeToQuery(dbQuery, scopeFilters);
  dbQuery = applySearchToQuery(dbQuery, query.search);

  let { data, error } = await dbQuery;

  if (error && query.search && isMissingNikColumnError(error.message)) {
    let retryQuery = admin
      .from("drivers")
      .select(DRIVER_SELECT)
      .order("created_at", { ascending: false });

    retryQuery = applyRegionalScopeToQuery(retryQuery, scopeFilters);
    retryQuery = applySearchToQuery(retryQuery, query.search, true);
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
