import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * PROTEKSI PRIVILEGE ESCALATION
 *
 * Jangan pernah percaya `role` dari localStorage, cookie client, atau body request.
 * Satu-satunya sumber kebenaran: `supabase.auth.getUser()` + query `profiles` di PostgreSQL.
 *
 * Di skema WIRA, enum `user_role.admin` = hak SUPER_ADMIN (akses penuh panel admin).
 * Jika Anda menambah tier admin di masa depan, perluas pengecekan di sini saja.
 */
export const SUPER_ADMIN_DB_ROLE = "admin" as const;

export type AdminSession = {
  userId: string;
  email: string | null;
  role: typeof SUPER_ADMIN_DB_ROLE;
};

/** Verifikasi server-side untuk API Route / Server Action. */
export async function requireSuperAdmin(): Promise<
  AdminSession | { error: string; status: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Belum login", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: "Profil tidak ditemukan", status: 403 };
  }

  if (profile.role !== SUPER_ADMIN_DB_ROLE) {
    return {
      error: "Akses ditolak — bukan SUPER_ADMIN",
      status: 403,
    };
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: SUPER_ADMIN_DB_ROLE,
  };
}

/** Guard untuk Server Components halaman `/admin/*`. */
export async function assertSuperAdminPage(): Promise<AdminSession> {
  const result = await requireSuperAdmin();
  if ("error" in result) {
    if (result.status === 401) {
      redirect("/login?redirect=/admin");
    }
    redirect("/unauthorized");
  }
  return result;
}

/** @deprecated Gunakan requireSuperAdmin — disimpan untuk kompatibilitas API lama. */
export async function requireAdmin() {
  return requireSuperAdmin();
}
