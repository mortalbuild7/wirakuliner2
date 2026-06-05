import { getAuthDriver } from "@/lib/driver-server";
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
  const rl = enforceRateLimit(req, "driver-fcm-token", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{ fcmToken?: string; platform?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const fcmToken = sanitizeText(parsed.data.fcmToken, 512);
  if (!fcmToken || fcmToken.length < 20) {
    return secureJsonResponse({ error: "FCM token tidak valid" }, { status: 400 });
  }

  const platform = sanitizeText(parsed.data.platform, 20) ?? "android";

  const admin = createAdminClient();
  const { error } = await admin
    .from("drivers")
    .update({ fcm_token: fcmToken })
    .eq("id", auth.driver.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, platform });
}
