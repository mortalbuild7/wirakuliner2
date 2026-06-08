import { getAuthDriver } from "@/lib/driver-server";
import { DRIVER_REWARD_POINTS_PER_ORDER } from "@/lib/order-flow";
import { distributeWalletEarnings } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const rl = enforceRateLimit(req, "driver-complete", RATE_LIMITS.apiWrite);
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

  if (order.order_status !== "on_the_way") {
    return secureJsonResponse(
      { error: "Selesaikan setelah pesanan dalam perjalanan" },
      { status: 400 }
    );
  }

  const { error: orderErr } = await admin
    .from("orders")
    .update({ order_status: "delivered" })
    .eq("id", orderId);

  if (orderErr) {
    return secureJsonResponse({ error: orderErr.message }, { status: 500 });
  }

  let walletCredited = false;
  try {
    const dist = await distributeWalletEarnings(admin, orderId);
    walletCredited = dist.distributed;
  } catch {
    /* earnings best-effort; order tetap selesai */
  }

  let pointsAwarded = 0;
  const { data: existing } = await admin
    .from("driver_point_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("driver_id", auth.driver.id)
    .maybeSingle();

  if (!existing) {
    const current = auth.driver.reward_points ?? 0;
    await admin
      .from("drivers")
      .update({ reward_points: current + DRIVER_REWARD_POINTS_PER_ORDER })
      .eq("id", auth.driver.id);
    await admin.from("driver_point_transactions").insert({
      driver_id: auth.driver.id,
      order_id: orderId,
      points: DRIVER_REWARD_POINTS_PER_ORDER,
      reason: "delivery_complete",
    });
    pointsAwarded = DRIVER_REWARD_POINTS_PER_ORDER;
  }

  const { count } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", auth.driver.id)
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);

  if ((count ?? 0) === 0) {
    await admin.from("drivers").update({ status: "idle" }).eq("id", auth.driver.id);
  }

  return secureJsonResponse({ ok: true, pointsAwarded, walletCredited });
}
