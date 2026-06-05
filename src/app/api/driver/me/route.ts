import { getAuthDriverFromRequest } from "@/lib/driver-server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-me", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await getAuthDriverFromRequest(req);
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { driver } = auth;
  return secureJsonResponse({
    ok: true,
    driver: {
      id: driver.id,
      profile_id: driver.profile_id,
      name: driver.name,
      phone: driver.phone,
      vehicle_plate: driver.vehicle_plate,
      status: driver.status,
      current_lat: driver.current_lat,
      current_lng: driver.current_lng,
      reward_points: driver.reward_points,
      photo_url: driver.photo_url ?? null,
    },
  });
}
