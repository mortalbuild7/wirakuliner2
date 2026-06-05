import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-setup", RATE_LIMITS.auth);
  if (rl) return rl;

  const parsed = await readJsonBody<{ phone?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const phone = sanitizeText(parsed.data.phone, 20);
  if (!phone || phone.length < 8) {
    return secureJsonResponse({ error: "Nomor telepon tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "driver") {
    return secureJsonResponse({ error: "Akun bukan role driver" }, { status: 403 });
  }

  const normalized = phone.replace(/\s/g, "");
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("drivers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    return secureJsonResponse({ ok: true, linked: true });
  }

  const { data: driver } = await admin
    .from("drivers")
    .select("id, profile_id, phone")
    .is("profile_id", null)
    .or(`phone.eq.${normalized},phone.eq.${phone}`)
    .limit(1)
    .maybeSingle();

  if (!driver) {
    return secureJsonResponse(
      { error: "Nomor tidak ditemukan. Minta admin mendaftarkan Anda." },
      { status: 404 }
    );
  }

  const { error } = await admin
    .from("drivers")
    .update({ profile_id: user.id, status: "offline" })
    .eq("id", driver.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, driverId: driver.id });
}
