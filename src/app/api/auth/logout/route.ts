import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Akhiri sesi login — hapus cookie auth di server. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;

  const rl = enforceRateLimit(req, "auth-logout", RATE_LIMITS.auth);
  if (rl) return rl;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, message: "Sesi berhasil diakhiri" });
}
