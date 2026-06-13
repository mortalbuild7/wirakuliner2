import { checkServiceAvailability } from "@/lib/service-area";
import { evaluateDriverProximityAvailability } from "@/lib/customer-driver-match";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceType, type ServiceType } from "@/lib/service-types";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  try {
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

    if (serviceType === "NGOJEK" || serviceType === "NGOMOBIL" || serviceType === "PAKET") {
      let admin;
      try {
        admin = createAdminClient();
      } catch (error) {
        const detail = extractServerErrorMessage(error);
        console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
        return secureJsonResponse({
          ok: true,
          available: false,
          error_code: "RPC_ERROR",
          message: detail,
          matchMode: "gps_proximity",
          debug_info: { server_error_detail: detail },
        });
      }

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

    const lat = parseFloat(String(latRaw ?? "").trim());
    const lng = parseFloat(String(lngRaw ?? "").trim());
    if (!Number.isFinite(lat) || isNaN(lat) || !Number.isFinite(lng) || isNaN(lng)) {
      return secureJsonResponse({
        ok: true,
        available: false,
        message: "Koordinat GPS HP Customer tidak valid",
      });
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
  } catch (error) {
    const detail = extractServerErrorMessage(error);
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return secureJsonResponse({
      ok: true,
      available: false,
      error_code: "RPC_ERROR",
      message: detail,
      debug_info: { server_error_detail: detail },
    });
  }
}
