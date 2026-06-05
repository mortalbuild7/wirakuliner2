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

/** Kirim FCM ke driver idle saat order delivery terkonfirmasi (paid). */
export async function notifyDriversNewOrder(orderId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_status, delivery_address, is_outside_radius, negotiation_status")
    .eq("id", orderId)
    .single();

  if (
    !order ||
    !["paid", "ready_for_pickup"].includes(order.order_status)
  ) {
    return { skipped: true };
  }
  if (isOnsiteOrder(order.delivery_address)) return { skipped: true };

  const type =
    order.order_status === "ready_for_pickup" ? "ready_for_pickup" : "delivery_paid";
  return callDriverPush(type, order);
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
