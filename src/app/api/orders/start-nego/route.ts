import { startOrderNegotiation } from "@/lib/start-nego";
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
  const rl = enforceRateLimit(req, "orders-start-nego", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{ orderId?: string; accuracyM?: number }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const result = await startOrderNegotiation(orderId, parsed.data.accuracyM);
  if ("error" in result) {
    return secureJsonResponse({ error: result.error }, { status: result.status });
  }

  return secureJsonResponse(result);
}
