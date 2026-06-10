import { createClient } from "@/lib/supabase/server";
import { enforceCustomerProfileRateLimit } from "@/lib/security/upstash-customer-profile";
import {
  enforceMethod,
  secureJsonResponse,
} from "@/lib/security/enforce";

/**
 * GET /api/customer/profile — data pribadi customer yang sedang login.
 *
 * Privasi (UU PDP):
 * - TIDAK menerima customer_id dari query/body — anti IDOR & harvesting
 * - user_id dari supabase.auth.getUser() (JWT HttpOnly cookie)
 * - Rate limit 10 req/menit/IP via @upstash/ratelimit
 */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;

  const rateBlock = await enforceCustomerProfileRateLimit(req);
  if (rateBlock) return rateBlock;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, name, phone, email, role, account_status, province_id, city_id, created_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return secureJsonResponse(
      { error: "Gagal memuat profil" },
      { status: 500 }
    );
  }

  if (!profile) {
    return secureJsonResponse({ error: "Profil tidak ditemukan" }, { status: 404 });
  }

  if (profile.role !== "customer") {
    return secureJsonResponse(
      { error: "Endpoint ini hanya untuk akun customer" },
      { status: 403 }
    );
  }

  return secureJsonResponse({
    ok: true,
    profile: {
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      accountStatus: profile.account_status ?? "active",
      createdAt: profile.created_at,
    },
  });
}
