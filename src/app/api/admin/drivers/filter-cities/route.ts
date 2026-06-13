import { requireAdmin } from "@/lib/admin-server";
import { fetchDriverFilterCities } from "@/lib/admin/drivers-list";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Opsi kota untuk dropdown filter driver (SUPER_ADMIN). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-drivers-filter-cities", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  if (auth.adminRole !== "SUPER_ADMIN") {
    return secureJsonResponse({ error: "Hanya SUPER_ADMIN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const provinceIdRaw = url.searchParams.get("provinceId");
  const provinceId =
    provinceIdRaw && Number.isInteger(Number(provinceIdRaw))
      ? Number(provinceIdRaw)
      : null;

  const { cities, error } = await fetchDriverFilterCities(provinceId);

  if (error) {
    return secureJsonResponse({ error }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, cities });
}
