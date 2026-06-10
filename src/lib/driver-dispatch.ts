import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignDriverOffer,
  declineDriverOffer,
  rotateOfferForOrder,
  type OfferableOrder,
  type RotateOfferResult,
} from "@/lib/driver-order-offer";
import {
  findPriorityDrivers,
  resolveDispatchOrigin,
  type PriorityDriverRow,
  DISPATCH_SEARCH_RADIUS_KM,
} from "@/lib/driver-dispatch-pick";
import { recordDriverKpiEvent } from "@/lib/driver-kpi";
import { createAdminClient } from "@/lib/supabase/admin";

export {
  findPriorityDrivers,
  resolveDispatchOrigin,
  DISPATCH_SEARCH_RADIUS_KM,
  type PriorityDriverRow,
};

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

/** Kirim FCM ke driver yang sedang ditawari order. */
export async function pushOfferToDriver(
  orderId: string,
  driverId: string | null
): Promise<void> {
  if (!driverId) return;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_status, delivery_address, is_outside_radius, negotiation_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return;

  const type =
    order.order_status === "ready_for_pickup" ? "ready_for_pickup" : "delivery_paid";

  void callDriverPush(type, {
    ...order,
    offered_driver_id: driverId,
  });
}

/** Dispatch order ke driver KPI terbaik (indeks 0) + FCM. */
export async function dispatchOrderOffer(
  orderId: string
): Promise<RotateOfferResult | null> {
  const result = await assignDriverOffer(orderId);
  if (result?.driverId) {
    const admin = createAdminClient();
    await recordDriverKpiEvent(admin, result.driverId, "offer_sent");
    await pushOfferToDriver(orderId, result.driverId);
  }
  return result;
}

/** Rotasi penawaran + FCM ke driver KPI berikutnya. */
export async function rotateAndDispatchOrder(
  orderId: string,
  forceRotate = false
): Promise<RotateOfferResult | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const result = await rotateOfferForOrder(
    admin,
    order as OfferableOrder,
    forceRotate
  );

  if (result.changed && result.driverId) {
    await recordDriverKpiEvent(admin, result.driverId, "offer_sent");
    await pushOfferToDriver(orderId, result.driverId);
  }

  return result;
}

/** Proses timeout 15 detik — rotasi + FCM ke driver KPI berikutnya. */
export async function processExpiredOffersAndDispatch(): Promise<void> {
  const admin = createAdminClient();

  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id"
    )
    .is("driver_id", null)
    .in("order_status", ["paid", "preparing", "ready_for_pickup"]);

  for (const order of orders ?? []) {
    const before = order.offered_driver_id;
    const result = await rotateOfferForOrder(admin, order as OfferableOrder);
    if (result.changed && result.driverId && result.driverId !== before) {
      await recordDriverKpiEvent(admin, result.driverId, "offer_sent");
      await pushOfferToDriver(order.id, result.driverId);
    }
  }
}

/** Driver menolak — catat KPI + oper ke driver peringkat berikutnya + FCM. */
export async function declineAndRedispatch(
  orderId: string,
  driverId: string
): Promise<{ ok: boolean; error?: string; nextDriverId?: string | null }> {
  const admin = createAdminClient();
  await recordDriverKpiEvent(admin, driverId, "offer_declined");

  const result = await declineDriverOffer(admin, orderId, driverId);
  if (!result.ok) return result;

  if (result.nextDriverId) {
    await recordDriverKpiEvent(admin, result.nextDriverId, "offer_sent");
    await pushOfferToDriver(orderId, result.nextDriverId);
  }

  return result;
}
