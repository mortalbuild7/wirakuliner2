import { getAuthDriver } from "@/lib/driver-server";
import { declineAndRedispatch } from "@/lib/driver-dispatch";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-decline-offer", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{ orderId?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const result = await declineAndRedispatch(orderId, auth.driver.id);

  if (!result.ok) {
    return secureJsonResponse({ error: result.error ?? "Gagal menolak" }, { status: 400 });
  }

  return secureJsonResponse({ ok: true, nextDriverId: result.nextDriverId ?? null });
}
