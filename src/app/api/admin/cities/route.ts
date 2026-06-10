import { requireAdmin } from "@/lib/admin-server";
import { applyRegionalServiceCityScope } from "@/lib/admin/regional-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-cities-get", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  let query = admin.from("service_cities").select("id, name, province_id, city_id").order("name");

  query = applyRegionalServiceCityScope(query, auth);

  const { data, error } = await query;

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, cities: data ?? [] });
}

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-cities-post", RATE_LIMITS.adminWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{
    name?: string;
    slug?: string;
    center_lat?: number;
    center_lng?: number;
    radius_km?: number;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const name = sanitizeText(parsed.data.name, 120);
  const slug =
    sanitizeText(parsed.data.slug, 80)?.toLowerCase().replace(/\s+/g, "-") ??
    name?.toLowerCase().replace(/\s+/g, "-");
  const centerLat = parseBoundedNumber(parsed.data.center_lat, -90, 90);
  const centerLng = parseBoundedNumber(parsed.data.center_lng, -180, 180);
  const radiusKm = parseBoundedNumber(parsed.data.radius_km, 1, 100) ?? 12;

  if (!name || !slug || centerLat == null || centerLng == null) {
    return secureJsonResponse(
      { error: "Nama, slug, dan koordinat pusat wajib diisi" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_cities")
    .insert({
      name,
      slug,
      center_lat: centerLat,
      center_lng: centerLng,
      radius_km: radiusKm,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 400 });
  }

  return secureJsonResponse({ ok: true, cityId: data.id });
}
