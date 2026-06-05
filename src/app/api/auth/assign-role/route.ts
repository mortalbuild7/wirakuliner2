import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const ALLOWED_SELF_ASSIGN: UserRole[] = ["merchant", "customer"];

/**
 * Tetapkan peran profil setelah daftar (server, service role).
 * Hanya merchant | customer — admin tidak bisa self-assign.
 */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "assign-role", RATE_LIMITS.auth);
  if (rl) return rl;

  try {
    const parsed = await readJsonBody<{ role?: UserRole }>(req, 4096);
    if ("error" in parsed) return parsed.error;
    const { role } = parsed.data;
    if (!role || !ALLOWED_SELF_ASSIGN.includes(role)) {
      return secureJsonResponse({ error: "Peran tidak valid" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return secureJsonResponse({ error: "Belum login" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "",
      role,
    });

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }

    return secureJsonResponse({ ok: true, role });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal assign role" },
      { status: 500 }
    );
  }
}
