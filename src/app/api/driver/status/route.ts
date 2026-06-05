import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import type { DriverStatus } from "@/types/database";

const ALLOWED: DriverStatus[] = ["offline", "idle", "delivering"];

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-status", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriverFromRequest(req);
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{ status?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const status = parsed.data.status as DriverStatus;
  if (!ALLOWED.includes(status)) {
    return secureJsonResponse({ error: "Status tidak valid" }, { status: 400 });
  }

  if (status !== "delivering" && auth.driver.status === "delivering") {
    const admin = createAdminClient();
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", auth.driver.id)
      .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);

    if ((count ?? 0) > 0) {
      return secureJsonResponse(
        { error: "Selesaikan pengantaran aktif terlebih dahulu" },
        { status: 409 }
      );
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("drivers")
    .update({ status })
    .eq("id", auth.driver.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, status });
}
