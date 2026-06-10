import { ADMIN_ROLES } from "@/app/utils/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_DB_ROLE } from "@/lib/admin-auth";
import { syncAdminJwtMetadata } from "@/lib/sync-admin-jwt-metadata";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import type { AdminTier } from "@/app/utils/adminAuth";
import {
  enforceMethod,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { enforceAdminLoginRateLimit } from "@/lib/security/upstash-admin-login";
import { sanitizeText } from "@/lib/security/validate";

/**
 * Endpoint login khusus Panel Admin.
 *
 * Dipanggil dari halaman `/admin/login` (satu pintu admin) agar:
 * - Rate limit Upstash (middleware) berlaku sebelum kredensial diproses
 * - Role SUPER_ADMIN diverifikasi server-side sebelum sesi diterima
 *
 * Catatan MFA: setelah login sukses, middleware akan mengarahkan ke
 * /admin/mfa-verify jika akun admin sudah mendaftarkan TOTP namun belum aal2.
 */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;

  const rateBlock = await enforceAdminLoginRateLimit(req);
  if (rateBlock) return rateBlock;

  const parsed = await readJsonBody<{ email?: string; password?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const email = sanitizeText(parsed.data.email, 254)?.toLowerCase();
  const password = parsed.data.password;

  if (!email || !password || password.length < 8 || password.length > 128) {
    return secureJsonResponse(
      { error: "Email atau password tidak valid" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return secureJsonResponse(
      { error: "Email atau password salah" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role, province_id, city_id")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== SUPER_ADMIN_DB_ROLE) {
    await supabase.auth.signOut();
    return secureJsonResponse(
      { error: "Akun ini bukan admin panel" },
      { status: 403 }
    );
  }

  const adminRole = profile.admin_role as AdminTier | null;
  if (!adminRole || !ADMIN_ROLES.includes(adminRole)) {
    await supabase.auth.signOut();
    return secureJsonResponse(
      { error: "Tier admin tidak valid — hubungi SUPER_ADMIN" },
      { status: 403 }
    );
  }

  try {
    const service = getSupabaseAdmin();
    await syncAdminJwtMetadata(service, data.user.id, {
      adminRole,
      provinceId: profile.province_id,
      cityId: profile.city_id,
    });
  } catch {
    /* metadata sync best-effort; profiles tetap sumber fallback RLS */
  }

  return secureJsonResponse({
    ok: true,
    redirect: "/admin/dashboard",
    userId: data.user.id,
  });
}
