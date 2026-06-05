import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Proxy ke edge function send-driver-push (nego / delivery). */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "fcm-driver-notify", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{ record?: Record<string, unknown>; type?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const record = parsed.data.record;
  if (!record?.id) {
    return secureJsonResponse({ error: "record.id wajib" }, { status: 400 });
  }

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-driver-push`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fnUrl || !serviceKey) {
    return secureJsonResponse({ skipped: true, reason: "no_config" });
  }

  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      type: parsed.data.type ?? "negotiation",
      record,
    }),
  });

  const json = await res.json().catch(() => ({ error: "notify_failed" }));
  return secureJsonResponse(json, { status: res.status });
}
