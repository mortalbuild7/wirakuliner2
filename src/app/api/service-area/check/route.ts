import { checkServiceAvailability } from "@/lib/service-area";
import { checkDriverAvailabilityServer } from "@/lib/customer-driver-match";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceType, type ServiceType } from "@/lib/service-types";
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
  const serviceTypeRaw = url.searchParams.get("serviceType");
  const serviceType: ServiceType | null = isServiceType(serviceTypeRaw)
    ? serviceTypeRaw
    : null;

  if (lat == null || lng == null) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (serviceType === "NGOJEK" || serviceType === "NGOMOBIL") {
    const available = await checkDriverAvailabilityServer(
      admin,
      lat,
      lng,
      serviceType
    );
    const meta = await checkServiceAvailability(admin, lat, lng);
    return secureJsonResponse({
      ok: true,
      available,
      message: available
        ? null
        : "Maaf, layanan Wira Kuliner belum tersedia atau driver belum siap di wilayah ini. Kami akan segera hadir!",
      cityId: meta.cityId,
      cityName: meta.cityName,
      matchMode: "gps_proximity",
    });
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
