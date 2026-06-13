import { checkServiceAvailability } from "@/lib/service-area";
import { evaluateDriverProximityAvailability } from "@/lib/customer-driver-match";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceType, type ServiceType } from "@/lib/service-types";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "service-area-check", RATE_LIMITS.api);
  if (rl) return rl;

  const url = new URL(req.url);
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const serviceTypeRaw = url.searchParams.get("serviceType");
  const serviceType: ServiceType | null = isServiceType(serviceTypeRaw)
    ? serviceTypeRaw
    : null;

  const admin = createAdminClient();

  if (serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType === "PAKET") {
    const result = await evaluateDriverProximityAvailability(
      admin,
      latRaw,
      lngRaw,
      serviceType
    );

    return secureJsonResponse({
      ok: true,
      available: result.available,
      error_code: result.error_code,
      message: result.message ?? null,
      matchMode: "gps_proximity",
      effective_lat: result.effective_lat,
      effective_lng: result.effective_lng,
      debug_info: result.debug_info,
    });
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const result = await checkServiceAvailability(admin, lat, lng);

  return secureJsonResponse({
    ok: true,
    available: result.available,
    message: result.message ?? null,
    cityId: result.cityId,
    cityName: result.cityName,
  });
}
