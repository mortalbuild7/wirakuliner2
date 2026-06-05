import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder } from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Order aktif + antrian masuk driver — bypass RLS setelah verifikasi driver. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-order-pool", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await getAuthDriverFromRequest(req);
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { driver } = auth;
  const admin = createAdminClient();

  const orderSelect =
    "*, merchants(name, latitude, longitude, address), profiles:customer_id(name, phone)";

  const { data: activeOrder } = await admin
    .from("orders")
    .select(orderSelect)
    .eq("driver_id", driver.id)
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeOrder) {
    return secureJsonResponse({ activeOrder, incoming: [] });
  }

  const isOnline = driver.status === "idle" || driver.status === "delivering";
  if (!isOnline) {
    return secureJsonResponse({ activeOrder: null, incoming: [] });
  }

  const { data: paidPool } = await admin
    .from("orders")
    .select(orderSelect)
    .is("driver_id", null)
    .in("order_status", ["paid", "preparing", "ready_for_pickup"])
    .order("created_at", { ascending: false })
    .limit(15);

  const { data: negoPool } = await admin
    .from("orders")
    .select(orderSelect)
    .is("driver_id", null)
    .eq("negotiation_status", "negotiating")
    .eq("is_outside_radius", true)
    .eq("order_status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(5);

  const merged = [...(negoPool ?? []), ...(paidPool ?? [])];
  const incoming = merged.filter((o) => !isOnsiteOrder(o.delivery_address));

  return secureJsonResponse({ activeOrder: null, incoming });
}
