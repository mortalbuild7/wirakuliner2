import { getAuthDriver } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-location", { limit: 40, windowMs: 60_000 });
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  if (auth.driver.status === "offline") {
    return secureJsonResponse({ error: "Driver offline" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ lat?: number; lng?: number }>(req);
  if ("error" in parsed) return parsed.error;

  const lat = parseBoundedNumber(parsed.data.lat, -90, 90);
  const lng = parseBoundedNumber(parsed.data.lng, -180, 180);
  if (lat == null || lng == null) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("drivers")
    .update({ current_lat: lat, current_lng: lng })
    .eq("id", auth.driver.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true });
}
