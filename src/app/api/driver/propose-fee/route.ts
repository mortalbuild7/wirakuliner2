import { getAuthDriver } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, parseBoundedNumber } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-propose", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{ orderId?: string; proposedFee?: number }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  const proposedFee = parseBoundedNumber(parsed.data.proposedFee, 0, 5_000_000);

  if (!isValidUuid(orderId) || proposedFee == null) {
    return secureJsonResponse({ error: "Data tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("negotiation_status")
    .eq("id", orderId)
    .single();

  if (!order || order.negotiation_status !== "negotiating") {
    return secureJsonResponse({ error: "Order tidak dalam nego" }, { status: 400 });
  }

  const { data: nego } = await admin
    .from("negotiations")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("driver_id", auth.driver.id)
    .maybeSingle();

  if (!nego) {
    const { error: insErr } = await admin.from("negotiations").insert({
      order_id: orderId,
      driver_id: auth.driver.id,
      proposed_fee: proposedFee,
      status: "pending",
    });
    if (insErr) {
      return secureJsonResponse({ error: insErr.message }, { status: 500 });
    }
    return secureJsonResponse({ ok: true });
  }

  if (nego.status === "accepted") {
    return secureJsonResponse({ error: "Nego sudah disetujui customer" }, { status: 409 });
  }

  const { error } = await admin
    .from("negotiations")
    .update({ proposed_fee: proposedFee, status: "pending" })
    .eq("id", nego.id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true });
}
