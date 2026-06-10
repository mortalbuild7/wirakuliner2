import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { redactCustomerProfileForDriver } from "@/lib/privacy/phone-mask";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Detail pesanan driver + nama customer (operasional). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-order-detail", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await getAuthDriverFromRequest(req);
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "Pesanan tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "*, merchants(name, latitude, longitude, address), profiles:customer_id(name, phone), order_items(*)"
    )
    .eq("id", id)
    .single();

  if (error || !order) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const isAssigned = order.driver_id === auth.driver.id;
  const isPool =
    !order.driver_id &&
    order.offered_driver_id === auth.driver.id &&
    ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);

  if (!isAssigned && !isPool) {
    return secureJsonResponse({ error: "Pesanan tidak tersedia" }, { status: 403 });
  }

  return secureJsonResponse({ order: redactCustomerProfileForDriver(order) });
}
