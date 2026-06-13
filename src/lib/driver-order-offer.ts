import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DISPATCH_SEARCH_RADIUS_KM,
  findPriorityDrivers,
  resolveDispatchOrigin,
  resolveOrderDispatchContext,
} from "@/lib/driver-dispatch-pick";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isOfferExpired,
  orderNeedsOfferRotation,
  type OfferableOrder,
  type RotateOfferResult,
} from "@/lib/driver-order-offer-utils";

export {
  DRIVER_OFFER_TIMEOUT_MS,
  isOfferExpired,
  offerSecondsLeft,
  orderNeedsOfferRotation,
  type OfferableOrder,
  type RotateOfferResult,
} from "@/lib/driver-order-offer-utils";

/**
 * Pilih driver berikutnya via RPC KPI:
 * - Filter ONLINE+AVAILABLE (status idle), radius Haversine, skip/busy/pending.
 * - Urutkan Skor DESC → ambil indeks 0.
 */
async function pickNextDriver(
  admin: SupabaseClient,
  orderId: string,
  skipIds: string[],
  serviceCityId?: string | null,
  _operationalClusterId?: string | null
): Promise<RotateOfferResult> {
  const origin = await resolveDispatchOrigin(admin, orderId);
  if (!origin) {
    return { driverId: null, changed: false };
  }

  const dispatchCtx = await resolveOrderDispatchContext(admin, orderId);
  const service = dispatchCtx?.requestedService ?? ("NGOJEK" as const);
  const isTransit = service === "NGOJEK" || service === "NGOMOBIL";

  const driverOpts = {
    lat: origin.lat,
    lng: origin.lng,
    maxRadiusKm: isTransit ? undefined : DISPATCH_SEARCH_RADIUS_KM,
    serviceCityId: isTransit ? null : serviceCityId ?? origin.serviceCityId,
    operationalClusterId: origin.operationalClusterId,
    pickupProvinceId: origin.pickupProvinceId,
    hasOfficialBranch: origin.hasOfficialBranch,
    limit: 1,
    requestedService: service,
    packageVolumeCm3: dispatchCtx?.packageVolumeCm3 ?? 0,
  };

  let drivers = await findPriorityDrivers(admin, {
    ...driverOpts,
    skipDriverIds: skipIds,
  });

  if (!drivers.length && skipIds.length > 0) {
    drivers = await findPriorityDrivers(admin, {
      ...driverOpts,
      skipDriverIds: [],
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
    order.service_city_id,
    order.operational_cluster_id
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
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id, operational_cluster_id"
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
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id, operational_cluster_id"
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
      "id, driver_id, offered_driver_id, offered_at, offer_skip_driver_ids, order_status, delivery_address, negotiation_status, service_city_id, operational_cluster_id"
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
