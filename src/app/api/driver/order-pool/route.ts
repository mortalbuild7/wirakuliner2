import { getAuthDriverFromRequest } from "@/lib/driver-server";
import {
  isOfferExpired,
  offerSecondsLeft,
  processAllPendingOffers,
} from "@/lib/driver-order-offer";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder } from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Order aktif + penawaran masuk (1 order / 1 driver, rotasi 30 detik). */
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

  await processAllPendingOffers(admin);

  const orderSelect =
    "*, merchants(name, latitude, longitude, address), profiles:customer_id(name, phone), order_items(id, product_name, quantity, price)";

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

  const { data: offeredOrders } = await admin
    .from("orders")
    .select(orderSelect)
    .is("driver_id", null)
    .eq("offered_driver_id", driver.id)
    .in("order_status", ["paid", "preparing", "ready_for_pickup"])
    .order("created_at", { ascending: true });

  const incomingOffer = (offeredOrders ?? []).find(
    (o) => !isOnsiteOrder(o.delivery_address) && !isOfferExpired(o.offered_at)
  );

  const incoming = incomingOffer ? [incomingOffer] : [];

  return secureJsonResponse({
    activeOrder: null,
    incoming,
    offerSecondsLeft: incomingOffer?.offered_at
      ? offerSecondsLeft(incomingOffer.offered_at)
      : null,
  });
}
