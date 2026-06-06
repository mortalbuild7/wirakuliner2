import type { SupabaseClient } from "@supabase/supabase-js";
import { isOnsiteOrder } from "@/lib/order-channel";
import { createAdminClient } from "@/lib/supabase/admin";

export const DRIVER_OFFER_TIMEOUT_MS = 30_000;

export type OfferableOrder = {
  id: string;
  driver_id: string | null;
  offered_driver_id: string | null;
  offered_at: string | null;
  offer_skip_driver_ids: string[] | null;
  order_status: string;
  delivery_address: string;
  negotiation_status: string;
};

export function isOfferExpired(offeredAt: string | null | undefined): boolean {
  if (!offeredAt) return true;
  return Date.now() - new Date(offeredAt).getTime() >= DRIVER_OFFER_TIMEOUT_MS;
}

export function offerSecondsLeft(offeredAt: string | null | undefined): number {
  if (!offeredAt) return 0;
  const left = DRIVER_OFFER_TIMEOUT_MS - (Date.now() - new Date(offeredAt).getTime());
  return Math.max(0, Math.ceil(left / 1000));
}

export function orderNeedsOfferRotation(order: OfferableOrder): boolean {
  if (order.driver_id) return false;
  if (isOnsiteOrder(order.delivery_address)) return false;
  if (order.negotiation_status === "negotiating") return false;
  return ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);
}

async function getBusyDriverIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin
    .from("orders")
    .select("driver_id")
    .not("driver_id", "is", null)
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);

  return new Set(
    (data ?? []).map((o) => o.driver_id as string).filter(Boolean)
  );
}

async function getDriversWithPendingOffer(
  admin: SupabaseClient,
  excludeOrderId?: string
): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - DRIVER_OFFER_TIMEOUT_MS).toISOString();
  const { data } = await admin
    .from("orders")
    .select("id, offered_driver_id, offered_at")
    .is("driver_id", null)
    .not("offered_driver_id", "is", null)
    .gt("offered_at", cutoff);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (excludeOrderId && row.id === excludeOrderId) continue;
    if (row.offered_driver_id) ids.add(row.offered_driver_id);
  }
  return ids;
}

async function pickNextDriver(
  admin: SupabaseClient,
  skipIds: string[],
  excludeOrderId?: string
): Promise<string | null> {
  const skip = new Set(skipIds);
  const busy = await getBusyDriverIds(admin);
  const pendingOffer = await getDriversWithPendingOffer(admin, excludeOrderId);

  const { data: drivers } = await admin
    .from("drivers")
    .select("id, status, updated_at")
    .eq("status", "idle")
    .order("updated_at", { ascending: true });

  for (const d of drivers ?? []) {
    if (skip.has(d.id)) continue;
    if (busy.has(d.id)) continue;
    if (pendingOffer.has(d.id)) continue;
    return d.id;
  }
  return null;
}

/** Rotasi penawaran ke driver berikutnya (atau pertahankan jika masih dalam 30 detik). */
export async function rotateOfferForOrder(
  admin: SupabaseClient,
  order: OfferableOrder,
  forceRotate = false
): Promise<string | null> {
  if (!orderNeedsOfferRotation(order)) {
    if (order.offered_driver_id) {
      await admin
        .from("orders")
        .update({ offered_driver_id: null, offered_at: null })
        .eq("id", order.id);
    }
    return null;
  }

  let skipIds = [...(order.offer_skip_driver_ids ?? [])];
  const expired = isOfferExpired(order.offered_at);
  const shouldRotate = forceRotate || !order.offered_driver_id || expired;

  if (order.offered_driver_id && shouldRotate) {
    skipIds = [...new Set([...skipIds, order.offered_driver_id])];
  }

  if (!shouldRotate && order.offered_driver_id) {
    return order.offered_driver_id;
  }

  let nextDriver = await pickNextDriver(admin, skipIds, order.id);
  if (!nextDriver && skipIds.length > 0) {
    skipIds = [];
    nextDriver = await pickNextDriver(admin, skipIds, order.id);
  }

  await admin
    .from("orders")
    .update({
      offered_driver_id: nextDriver,
      offered_at: nextDriver ? new Date().toISOString() : null,
      offer_skip_driver_ids: skipIds,
    })
    .eq("id", order.id)
    .is("driver_id", null);

  return nextDriver;
}

/** Proses semua order tanpa driver — expire & rotasi penawaran. */
export async function processAllPendingOffers(admin: SupabaseClient): Promise<void> {
  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status"
    )
    .is("driver_id", null)
    .in("order_status", ["paid", "preparing", "ready_for_pickup"]);

  for (const order of orders ?? []) {
    if (orderNeedsOfferRotation(order as OfferableOrder)) {
      await rotateOfferForOrder(admin, order as OfferableOrder);
    }
  }
}

/** Tugaskan penawaran pertama untuk order baru masuk pool. */
export async function assignDriverOffer(orderId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !orderNeedsOfferRotation(order as OfferableOrder)) return null;
  return rotateOfferForOrder(admin, order as OfferableOrder, !order.offered_driver_id);
}

/** Driver menolak — langsung rotasi ke driver lain. */
export async function declineDriverOffer(
  admin: SupabaseClient,
  orderId: string,
  driverId: string
): Promise<{ ok: boolean; error?: string; nextDriverId?: string | null }> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Order tidak ditemukan" };
  if (order.driver_id) return { ok: false, error: "Order sudah diambil driver lain" };
  if (order.offered_driver_id !== driverId) {
    return { ok: false, error: "Penawaran ini bukan untuk Anda" };
  }

  const skipIds = [...new Set([...(order.offer_skip_driver_ids ?? []), driverId])];
  const patched: OfferableOrder = {
    ...(order as OfferableOrder),
    offer_skip_driver_ids: skipIds,
    offered_driver_id: driverId,
    offered_at: order.offered_at,
  };

  const nextDriverId = await rotateOfferForOrder(admin, patched, true);
  return { ok: true, nextDriverId };
}
