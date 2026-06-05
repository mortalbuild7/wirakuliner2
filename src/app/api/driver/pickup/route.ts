import { getAuthDriver } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Driver mengambil pesanan di toko → on_the_way */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-pickup", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
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
    .select("id, driver_id, order_status")
    .eq("id", orderId)
    .single();

  if (!order || order.driver_id !== auth.driver.id) {
    return secureJsonResponse({ error: "Bukan order Anda" }, { status: 403 });
  }

  if (order.order_status !== "ready_for_pickup") {
    return secureJsonResponse(
      { error: "Pesanan belum siap diambil merchant" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("orders")
    .update({ order_status: "on_the_way" })
    .eq("id", orderId);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true });
}
