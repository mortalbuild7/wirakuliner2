import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { fetchOsrmDrivingRoute } from "@/lib/road-route";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

/** Proxy rute jalan OSRM untuk navigasi driver (hindari CORS di WebView APK). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-route", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await getAuthDriverFromRequest(req);
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
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

  const fallback = coordinates.length === 2;

  return secureJsonResponse({
    coordinates,
    fallback,
    distancePoints: coordinates.length,
  });
}
