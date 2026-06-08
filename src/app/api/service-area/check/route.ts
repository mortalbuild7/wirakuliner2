import { checkServiceAvailability } from "@/lib/service-area";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "service-area-check", RATE_LIMITS.api);
  if (rl) return rl;

  const url = new URL(req.url);
  const lat = parseBoundedNumber(url.searchParams.get("lat"), -90, 90);
  const lng = parseBoundedNumber(url.searchParams.get("lng"), -180, 180);

  if (lat == null || lng == null) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await checkServiceAvailability(admin, lat, lng);

  return secureJsonResponse({
    ok: true,
    available: result.available,
    message: result.message ?? null,
    cityId: result.cityId,
    cityName: result.cityName,
  });
}
