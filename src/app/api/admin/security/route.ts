import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const PROTECTIONS = [
  {
    id: "rate_limit",
    label: "Rate limiting",
    detail: "Batasi flood & brute-force per IP (API, halaman, auth)",
  },
  {
    id: "sql_guard",
    label: "Deteksi SQL injection",
    detail: "Blokir pola query berbahaya di URL & parameter",
  },
  {
    id: "parameterized",
    label: "Query terparameterisasi",
    detail: "Semua akses DB via Supabase client — tanpa raw SQL",
  },
  {
    id: "input_sanitize",
    label: "Sanitasi input",
    detail: "Validasi UUID, email, batas panjang teks, strip tag HTML",
  },
  {
    id: "payload_limit",
    label: "Batas ukuran body",
    detail: "Tolak payload JSON terlalu besar (anti flood)",
  },
  {
    id: "security_headers",
    label: "Security headers",
    detail: "CSP, X-Frame-Options, HSTS, anti MIME sniffing & XSS",
  },
  {
    id: "role_guard",
    label: "Role guard middleware",
    detail: "Hanya akun admin yang boleh akses /admin dan API admin",
  },
] as const;

/** Info sesi admin + status perlindungan keamanan. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;

  const rl = enforceRateLimit(req, "admin-security", RATE_LIMITS.admin);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role")
    .eq("id", auth.userId)
    .single();

  return secureJsonResponse({
    session: {
      userId: auth.userId,
      email: profile?.email ?? user?.email ?? null,
      name: profile?.name ?? null,
      lastSignIn: user?.last_sign_in_at ?? null,
    },
    protections: PROTECTIONS,
    rateLimits: {
      apiPerMinute: RATE_LIMITS.api.limit,
      authPer15Min: RATE_LIMITS.auth.limit,
      adminPerMinute: RATE_LIMITS.admin.limit,
      pagePerMinute: RATE_LIMITS.page.limit,
    },
  });
}
