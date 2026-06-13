import { getAuthDriver } from "@/lib/driver-server";
import { checkGpsVelocity } from "@/lib/driver-gps-velocity";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import {
  enforceDistributedRateLimit,
  enforceMethod,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

/**
 * ALUR GPS — Anti Fake GPS
 * - driver_id dari JWT (getAuthDriver), BUKAN body.
 * - Velocity check: loncat >120 km/jam dalam 30 detik → gps_trust = SUSPICIOUS.
 */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = await enforceDistributedRateLimit(
    req,
    "driver-gps-persist",
    RATE_LIMITS.driverGpsPersist
  );
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  if (auth.driver.status === "offline") {
    return secureJsonResponse({ error: "Driver offline" }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    lat?: number;
    lng?: number;
    driver_id?: string;
    persist?: boolean;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const idorBlock = rejectTrustedOwnerIdsInBody(parsed.data as Record<string, unknown>);
  if (idorBlock) return idorBlock;

  const lat = parseBoundedNumber(parsed.data.lat, -90, 90);
  const lng = parseBoundedNumber(parsed.data.lng, -180, 180);
  if (lat == null || lng == null) {
    return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: driverRow } = await admin
    .from("drivers")
    .select("current_lat, current_lng, last_gps_lat, last_gps_lng, last_gps_ping_at, updated_at")
    .eq("id", auth.driver.id)
    .maybeSingle();

  const forcePersist = parsed.data.persist === true;
  const lastPing = driverRow?.last_gps_ping_at ?? driverRow?.updated_at ?? null;
  const lastPingMs = lastPing ? new Date(lastPing).getTime() : 0;
  const persistDue = Date.now() - lastPingMs >= 55_000;

  if (!forcePersist && !persistDue) {
    return secureJsonResponse({
      ok: true,
      skipped: true,
      message: "Posisi live via broadcast; persist DB dijadwalkan",
      gpsTrust: "OK",
    });
  }

  const velocity = checkGpsVelocity(
    { lat, lng, driverId: auth.driver.id },
    {
      lat: driverRow?.last_gps_lat ?? driverRow?.current_lat ?? null,
      lng: driverRow?.last_gps_lng ?? driverRow?.current_lng ?? null,
      pingAt: driverRow?.last_gps_ping_at ?? driverRow?.updated_at ?? null,
    }
  );

  const patch: Record<string, unknown> = {
    current_lat: lat,
    current_lng: lng,
    last_gps_ping_at: new Date().toISOString(),
    last_gps_lat: lat,
    last_gps_lng: lng,
  };

  if (velocity.suspicious) {
    patch.gps_trust = "SUSPICIOUS";
    console.warn(
      `[gps-velocity] driver=${auth.driver.id} ${velocity.reason}`
    );
  } else if (forcePersist) {
    patch.gps_trust = "OK";
  }

  const { error } = await admin
    .from("drivers")
    .update(patch)
    .eq("id", auth.driver.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({
    ok: true,
    gpsTrust: velocity.suspicious ? "SUSPICIOUS" : "OK",
    velocityWarning: velocity.reason,
  });
}
