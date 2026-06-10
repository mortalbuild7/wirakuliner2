import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Tier admin regional — disimpan di profiles.admin_role + JWT app_metadata. */
export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "PROVINCE_ADMIN",
  "CITY_ADMIN",
] as const;

export type AdminTier = (typeof ADMIN_ROLES)[number];

export type RegionalAdminSession = {
  userId: string;
  email: string | null;
  /** profiles.role — selalu 'admin' untuk panel admin */
  dbRole: "admin";
  adminRole: AdminTier;
  provinceId: number | null;
  cityId: number | null;
  provinceName: string | null;
  cityName: string | null;
};

const MFA_CHALLENGE_PATH = "/admin/mfa-challenge";

/**
 * Verifikasi sesi admin server-side (Anti Session Hijacking).
 *
 * Lapisan keamanan:
 * 1. `supabase.auth.getUser()` — validasi JWT di server, bukan cookie client mentah
 * 2. Hard check `profiles.role === 'admin'` + `admin_role` tier valid
 * 3. MFA TOTP wajib aal2 sebelum akses data sensitif
 */
export async function verifyAdminSession(opts?: {
  requireSuperAdmin?: boolean;
  skipMfaRedirect?: boolean;
}): Promise<RegionalAdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?redirect=/admin");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, admin_role, province_id, city_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    redirect("/unauthorized");
  }

  const adminRole = profile.admin_role as AdminTier | null;
  if (!adminRole || !ADMIN_ROLES.includes(adminRole)) {
    redirect("/unauthorized");
  }

  if (opts?.requireSuperAdmin && adminRole !== "SUPER_ADMIN") {
    redirect("/unauthorized");
  }

  if (adminRole === "PROVINCE_ADMIN" && profile.province_id == null) {
    redirect("/unauthorized");
  }

  if (adminRole === "CITY_ADMIN" && profile.city_id == null) {
    redirect("/unauthorized");
  }

  if (!opts?.skipMfaRedirect) {
    const { data: aal, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      !mfaError &&
      aal?.nextLevel === "aal2" &&
      aal.currentLevel !== "aal2"
    ) {
      redirect(`${MFA_CHALLENGE_PATH}?redirect=/admin`);
    }
  }

  let provinceName: string | null = null;
  let cityName: string | null = null;

  if (profile.province_id != null) {
    const { data: prov } = await supabase
      .from("provinces")
      .select("name")
      .eq("id", profile.province_id)
      .maybeSingle();
    provinceName = prov?.name ?? null;
  }

  if (profile.city_id != null) {
    const { data: city } = await supabase
      .from("cities")
      .select("name")
      .eq("id", profile.city_id)
      .maybeSingle();
    cityName = city?.name ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    dbRole: "admin",
    adminRole,
    provinceId: profile.province_id ?? null,
    cityId: profile.city_id ?? null,
    provinceName,
    cityName,
  };
}

/** Judul dashboard dinamis sesuai lingkup wilayah admin. */
export function regionalDashboardTitle(session: RegionalAdminSession): string {
  if (session.adminRole === "SUPER_ADMIN") {
    return "Dashboard Operasional Nasional";
  }
  if (session.adminRole === "CITY_ADMIN" && session.cityName) {
    return `Dashboard Operasional ${session.cityName}`;
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceName) {
    return `Dashboard Operasional Provinsi ${session.provinceName}`;
  }
  return "Dashboard Operasional Regional";
}

/** Filter server-side untuk kueri orders sesuai lingkup admin. */
export function applyRegionalOrderScope<T extends { eq: (col: string, val: number) => T }>(
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

/** API / Server Action guard — tidak redirect, return error object. */
export async function requireRegionalAdmin(opts?: {
  requireSuperAdmin?: boolean;
}): Promise<RegionalAdminSession | { error: string; status: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Belum login", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role, province_id, city_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: "Bukan admin", status: 403 };
  }

  const adminRole = profile.admin_role as AdminTier | null;
  if (!adminRole || !ADMIN_ROLES.includes(adminRole)) {
    return { error: "Tier admin tidak valid", status: 403 };
  }

  if (opts?.requireSuperAdmin && adminRole !== "SUPER_ADMIN") {
    return { error: "Hanya SUPER_ADMIN", status: 403 };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return { error: "MFA belum diverifikasi", status: 403 };
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    dbRole: "admin",
    adminRole,
    provinceId: profile.province_id ?? null,
    cityId: profile.city_id ?? null,
    provinceName: null,
    cityName: null,
  };
}
