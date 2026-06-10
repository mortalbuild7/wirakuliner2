import { dispatchOrderOffer } from "@/lib/driver-dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder } from "@/lib/order-channel";

async function callDriverPush(type: string, record: Record<string, unknown>) {
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-driver-push`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fnUrl || !serviceKey) return { skipped: true, reason: "no_config" };

  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ type, record }),
  });

  return res.json().catch(() => ({ error: "notify_failed" }));
}

/**
 * Kirim penawaran ke driver KPI terbaik saat order terkonfirmasi (paid).
 * Dispatch + FCM ditangani oleh `dispatchOrderOffer` (KPI prioritas + rotasi 15 detik).
 */
export async function notifyDriversNewOrder(orderId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_status, delivery_address, is_outside_radius, negotiation_status")
    .eq("id", orderId)
    .single();

  if (
    !order ||
    !["paid", "ready_for_pickup", "preparing"].includes(order.order_status)
  ) {
    return { skipped: true };
  }
  if (isOnsiteOrder(order.delivery_address)) return { skipped: true };

  const result = await dispatchOrderOffer(orderId);

  return {
    offeredDriverId: result?.driverId ?? null,
    priorityScore: result?.priorityScore,
    pushed: Boolean(result?.driverId),
  };
}

/** FCM ke driver yang sudah menerima order saat merchant tandai siap diambil. */
export async function notifyDriverOrderReady(orderId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_status, delivery_address, driver_id, merchants(name)")
    .eq("id", orderId)
    .single();

  if (!order || order.order_status !== "ready_for_pickup" || !order.driver_id) {
    return { skipped: true };
  }

  return callDriverPush("ready_for_pickup", order);
}
