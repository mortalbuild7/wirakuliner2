import type { RegionalAdminSession } from "@/app/utils/adminAuth";

/** Query builder minimal — cukup untuk `.eq()` Supabase/PostgREST. */
type ScopedQuery<T> = { eq: (col: string, val: number) => T };

/**
 * Filter kueri entitas regional (drivers, merchants, orders).
 * CITY_ADMIN → city_id; PROVINCE_ADMIN → province_id; SUPER_ADMIN → tanpa filter.
 */
export function applyRegionalEntityScope<T extends ScopedQuery<T>>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return query.eq("province_id", session.provinceId);
  }
  return query;
}

/** Batasi dropdown kota layanan (service_cities) sesuai yurisdiksi admin. */
export function applyRegionalServiceCityScope<T extends ScopedQuery<T>>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return query.eq("province_id", session.provinceId);
  }
  return query;
}

/** Verifikasi server-side: entitas berada dalam wilayah admin (anti IDOR). */
export function entityWithinAdminScope(
  session: RegionalAdminSession,
  entity: { province_id?: number | null; city_id?: number | null }
): boolean {
  if (session.adminRole === "SUPER_ADMIN") return true;
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return entity.city_id === session.cityId;
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return entity.province_id === session.provinceId;
  }
  return false;
}

/** Kota layanan yang dipilih saat create/update harus dalam wilayah admin. */
export function serviceCityWithinAdminScope(
  session: RegionalAdminSession,
  city: { province_id?: number | null; city_id?: number | null }
): boolean {
  return entityWithinAdminScope(session, city);
}

/** Filter driver untuk laporan/komisi/pendaftaran — City Admin by kota pendaftaran. */
export function applyRegionalDriverRegistrationScope<T extends ScopedQuery<T>>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  return applyRegionalEntityScope(query, session);
}

/** Label lingkup untuk header halaman manajemen. */
export function regionalScopeHint(session: RegionalAdminSession): string {
  if (session.adminRole === "SUPER_ADMIN") return "Seluruh wilayah Indonesia";
  if (session.adminRole === "PROVINCE_ADMIN") {
    return `Provinsi ${session.provinceName ?? session.provinceId}`;
  }
  return `Kota ${session.cityName ?? session.cityId}`;
}
