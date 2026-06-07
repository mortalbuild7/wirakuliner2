import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Fitur nego driver dihapus — ongkir dihitung otomatis dari jarak. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-start-nego", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  return secureJsonResponse(
    { error: "Fitur nego driver tidak lagi tersedia. Ongkir dihitung otomatis." },
    { status: 410 }
  );
}
