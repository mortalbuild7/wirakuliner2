import type { SupabaseClient } from "@supabase/supabase-js";
import { isOnsiteOrder } from "@/lib/order-channel";
import {
  DISPATCH_SEARCH_RADIUS_KM,
  findPriorityDrivers,
  resolveDispatchOrigin,
} from "@/lib/driver-dispatch-pick";
import { createAdminClient } from "@/lib/supabase/admin";

/** Jeda respons driver sebelum rotasi ke KPI berikutnya (15 detik). */
export const DRIVER_OFFER_TIMEOUT_MS = 15_000;

export type OfferableOrder = {
  id: string;
  driver_id: string | null;
  offered_driver_id: string | null;
  offered_at: string | null;
  offer_skip_driver_ids: string[] | null;
  order_status: string;
  delivery_address: string;
  negotiation_status: string;
  service_city_id?: string | null;
};

export type RotateOfferResult = {
  driverId: string | null;
  changed: boolean;
  priorityScore?: number;
  distanceKm?: number;
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
  return ["paid", "preparing", "ready_for_pickup"].includes(order.order_status);
}

/**
 * Pilih driver berikutnya via RPC KPI:
 * - Filter ONLINE+AVAILABLE (status idle), radius Haversine, skip/busy/pending.
 * - Urutkan Skor DESC → ambil indeks 0.
 */
async function pickNextDriver(
  admin: SupabaseClient,
  orderId: string,
  skipIds: string[],
  serviceCityId?: string | null
): Promise<RotateOfferResult> {
  const origin = await resolveDispatchOrigin(admin, orderId);
  if (!origin) {
    return { driverId: null, changed: false };
  }

  let drivers = await findPriorityDrivers(admin, {
    lat: origin.lat,
    lng: origin.lng,
    maxRadiusKm: DISPATCH_SEARCH_RADIUS_KM,
    skipDriverIds: skipIds,
    serviceCityId: serviceCityId ?? origin.serviceCityId,
    limit: 1,
  });

  if (!drivers.length && skipIds.length > 0) {
    drivers = await findPriorityDrivers(admin, {
      lat: origin.lat,
      lng: origin.lng,
      maxRadiusKm: DISPATCH_SEARCH_RADIUS_KM,
      skipDriverIds: [],
      serviceCityId: serviceCityId ?? origin.serviceCityId,
      limit: 1,
    });
  }

  const top = drivers[0];
  if (!top) {
    return { driverId: null, changed: false };
  }

  return {
    driverId: top.driver_id,
    changed: true,
    priorityScore: Number(top.priority_score),
    distanceKm: Number(top.distance_km),
  };
}

/** Rotasi penawaran ke driver KPI berikutnya (atau pertahankan jika masih dalam 15 detik). */
export async function rotateOfferForOrder(
  admin: SupabaseClient,
  order: OfferableOrder,
  forceRotate = false
): Promise<RotateOfferResult> {
  if (!orderNeedsOfferRotation(order)) {
    if (order.offered_driver_id) {
      await admin
        .from("orders")
        .update({ offered_driver_id: null, offered_at: null })
        .eq("id", order.id);
    }
    return { driverId: null, changed: false };
  }

  let skipIds = [...(order.offer_skip_driver_ids ?? [])];
  const expired = isOfferExpired(order.offered_at);
  const shouldRotate = forceRotate || !order.offered_driver_id || expired;

  if (order.offered_driver_id && shouldRotate) {
    skipIds = [...new Set([...skipIds, order.offered_driver_id])];
  }

  if (!shouldRotate && order.offered_driver_id) {
    return { driverId: order.offered_driver_id, changed: false };
  }

  const picked = await pickNextDriver(
    admin,
    order.id,
    skipIds,
    order.service_city_id
  );

  await admin
    .from("orders")
    .update({
      offered_driver_id: picked.driverId,
      offered_at: picked.driverId ? new Date().toISOString() : null,
      offer_skip_driver_ids: skipIds,
    })
    .eq("id", order.id)
    .is("driver_id", null);

  return {
    ...picked,
    changed: picked.driverId !== order.offered_driver_id,
  };
}

/** Proses semua order tanpa driver — expire & rotasi penawaran. */
export async function processAllPendingOffers(admin: SupabaseClient): Promise<void> {
  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id"
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
export async function assignDriverOffer(
  orderId: string
): Promise<RotateOfferResult | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !orderNeedsOfferRotation(order as OfferableOrder)) return null;
  return rotateOfferForOrder(admin, order as OfferableOrder, !order.offered_driver_id);
}

/** Driver menolak — langsung rotasi ke driver KPI berikutnya. */
export async function declineDriverOffer(
  admin: SupabaseClient,
  orderId: string,
  driverId: string
): Promise<{ ok: boolean; error?: string; nextDriverId?: string | null }> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id"
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

  const result = await rotateOfferForOrder(admin, patched, true);
  return { ok: true, nextDriverId: result.driverId };
}
