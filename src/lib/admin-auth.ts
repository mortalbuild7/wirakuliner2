import { redirect } from "next/navigation";
import {
  requireRegionalAdmin,
  verifyAdminSession,
  type RegionalAdminSession,
} from "@/app/utils/adminAuth";

/**
 * Kompatibilitas legacy — panel admin memakai tier regional di `adminAuth.ts`.
 * `profiles.role = 'admin'` untuk semua tier; beda di `profiles.admin_role`.
 */
export const SUPER_ADMIN_DB_ROLE = "admin" as const;

export type AdminSession = {
  userId: string;
  email: string | null;
  role: typeof SUPER_ADMIN_DB_ROLE;
};

/** Hanya SUPER_ADMIN (finansial nasional, audit penuh). */
export async function requireSuperAdmin(): Promise<
  AdminSession | { error: string; status: number }
> {
  const result = await requireRegionalAdmin({ requireSuperAdmin: true });
  if ("error" in result) {
    return result;
  }
  return {
    userId: result.userId,
    email: result.email,
    role: SUPER_ADMIN_DB_ROLE,
  };
}

/** Semua tier admin regional (SUPER / PROVINCE / CITY). */
export async function requireAnyAdmin(): Promise<
  RegionalAdminSession | { error: string; status: number }
> {
  return requireRegionalAdmin();
}

/** Guard halaman admin regional + MFA. */
export async function assertAdminPage(): Promise<RegionalAdminSession> {
  return verifyAdminSession();
}

/** @deprecated Gunakan assertAdminPage — nama lama SUPER_ADMIN only. */
export async function assertSuperAdminPage(): Promise<AdminSession> {
  const session = await verifyAdminSession({ requireSuperAdmin: true });
  return {
    userId: session.userId,
    email: session.email,
    role: SUPER_ADMIN_DB_ROLE,
  };
}

/** @deprecated Gunakan requireAnyAdmin atau requireRegionalAdmin. */
export async function requireAdmin() {
  return requireRegionalAdmin();
}
