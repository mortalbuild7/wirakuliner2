import { notifyDriverOrderReady } from "@/lib/notify-drivers";
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
  const rl = enforceRateLimit(req, "notify-ready", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{ orderId?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const result = await notifyDriverOrderReady(orderId);
  return secureJsonResponse(result);
}
