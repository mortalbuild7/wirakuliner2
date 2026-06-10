import { getAuthDriver } from "@/lib/driver-server";
import { recordDriverKpiEvent } from "@/lib/driver-kpi";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder, isTransitOrder } from "@/lib/order-channel";
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
    .select(
      "id, driver_id, order_status, delivery_address, negotiation_status, offered_driver_id"
    )
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

  const allowedStatuses = ["paid", "preparing", "ready_for_pickup"];
  if (!allowedStatuses.includes(order.order_status)) {
    return secureJsonResponse(
      { error: `Order tidak bisa diterima (status: ${order.order_status})` },
      { status: 400 }
    );
  }

  if (order.offered_driver_id && order.offered_driver_id !== auth.driver.id) {
    return secureJsonResponse(
      { error: "Penawaran ini sedang ditawarkan ke driver lain" },
      { status: 409 }
    );
  }

  const isTransit = isTransitOrder(order.delivery_address);

  if (!order.driver_id) {
    const { data: claimed, error } = await admin
      .from("orders")
      .update({
        driver_id: auth.driver.id,
        offered_driver_id: null,
        offered_at: null,
        ...(isTransit ? { order_status: "ready_for_pickup" } : {}),
      })
      .eq("id", orderId)
      .is("driver_id", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }
    if (!claimed) {
      return secureJsonResponse({ error: "Order sudah diambil driver lain" }, { status: 409 });
    }
  }

  await admin
    .from("drivers")
    .update({ status: "delivering" })
    .eq("id", auth.driver.id);

  await recordDriverKpiEvent(admin, auth.driver.id, "offer_accepted");

  return secureJsonResponse({ ok: true });
}
