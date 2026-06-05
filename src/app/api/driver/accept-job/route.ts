import { getAuthDriver } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder } from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-accept", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  if (auth.driver.status === "offline") {
    return secureJsonResponse({ error: "Aktifkan status siap terima order" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ orderId?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, driver_id, order_status, delivery_address, negotiation_status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return secureJsonResponse({ error: "Order tidak ditemukan" }, { status: 404 });
  }

  if (isOnsiteOrder(order.delivery_address)) {
    return secureJsonResponse({ error: "Order ini bukan antar" }, { status: 400 });
  }

  if (order.driver_id && order.driver_id !== auth.driver.id) {
    return secureJsonResponse({ error: "Order sudah diambil driver lain" }, { status: 409 });
  }

  const allowedStatuses = ["paid", "preparing"];
  if (!allowedStatuses.includes(order.order_status)) {
    return secureJsonResponse({ error: "Order belum siap diambil" }, { status: 400 });
  }

  if (order.negotiation_status === "negotiating") {
    const { data: nego } = await admin
      .from("negotiations")
      .select("id")
      .eq("order_id", orderId)
      .eq("driver_id", auth.driver.id)
      .maybeSingle();
    if (!nego) {
      return secureJsonResponse({ error: "Anda tidak terlibat nego order ini" }, { status: 403 });
    }
  }

  if (!order.driver_id) {
    const { error } = await admin
      .from("orders")
      .update({ driver_id: auth.driver.id })
      .eq("id", orderId)
      .is("driver_id", null);

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }
  }

  await admin
    .from("drivers")
    .update({ status: "delivering" })
    .eq("id", auth.driver.id);

  return secureJsonResponse({ ok: true });
}
