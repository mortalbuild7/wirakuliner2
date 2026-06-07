import { fetchOsrmDrivingRoute } from "@/lib/road-route";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

/** Proxy rute jalan OSRM untuk customer (lacak pesanan). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "road-route", RATE_LIMITS.api);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromLat = parseBoundedNumber(url.searchParams.get("fromLat"), -90, 90);
  const fromLng = parseBoundedNumber(url.searchParams.get("fromLng"), -180, 180);
  const toLat = parseBoundedNumber(url.searchParams.get("toLat"), -90, 90);
  const toLng = parseBoundedNumber(url.searchParams.get("toLng"), -180, 180);

  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return secureJsonResponse({ error: "Koordinat rute tidak valid" }, { status: 400 });
  }

  const coordinates = await fetchOsrmDrivingRoute(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  );

  return secureJsonResponse({
    coordinates,
    fallback: coordinates.length === 2,
    distancePoints: coordinates.length,
  });
}
