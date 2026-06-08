import { getRateableTargets, listOrderRatings } from "@/lib/ratings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

type Params = { params: Promise<{ orderId: string }> };

export async function GET(req: Request, { params }: Params) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "ratings-order", RATE_LIMITS.api);
  if (rl) return rl;

  const { orderId } = await params;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "orderId tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, order_status, driver_id, merchant_id, delivery_address")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.customer_id !== user.id) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const ratings = await listOrderRatings(admin, orderId, user.id);
  const rateableTargets = getRateableTargets(order);

  return secureJsonResponse({
    ok: true,
    orderStatus: order.order_status,
    rateableTargets,
    ratings,
  });
}
