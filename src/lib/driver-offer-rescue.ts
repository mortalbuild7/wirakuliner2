import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/geo-config";
import { isOfferExpired } from "@/lib/driver-order-offer-utils";
import {
  isDriverIncomingOrderStatus,
  isNgomobilIncomingOrder,
  pickupWithinDriverRadius,
  resolveOrderServiceType,
} from "@/lib/driver-incoming-order";
import { isOnsiteOrder } from "@/lib/order-channel";
import type { Driver } from "@/types/database";

type OrphanOrder = {
  id: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  service_type: string | null;
  delivery_address: string;
  offered_driver_id: string | null;
  offered_at: string | null;
  order_status: string;
};

/**
 * Testing bypass: order NGOMOBIL paid tanpa driver — langsung tawarkan ke driver mobil online di radius.
 */
export async function rescueOrphanNgomobilOfferForDriver(
  admin: SupabaseClient,
  driver: Driver
): Promise<string | null> {
  if (driver.status !== "idle" && driver.status !== "delivering") return null;

  const dLat = driver.current_lat;
  const dLng = driver.current_lng;
  if (dLat == null || dLng == null || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
    return null;
  }

  const { data: orphans } = await admin
    .from("orders")
    .select(
      "id, pickup_lat, pickup_lng, service_type, delivery_address, offered_driver_id, offered_at, order_status"
    )
    .is("driver_id", null)
    .in("order_status", ["paid", "preparing", "ready_for_pickup"])
    .order("created_at", { ascending: false })
    .limit(12);

  for (const raw of orphans ?? []) {
    const order = raw as OrphanOrder;
    if (!isNgomobilIncomingOrder(order)) continue;
    if (!isDriverIncomingOrderStatus(order.order_status)) continue;
    if (isOnsiteOrder(order.delivery_address)) continue;

    const pLat = order.pickup_lat;
    const pLng = order.pickup_lng;
    if (pLat == null || pLng == null || !Number.isFinite(pLat) || !Number.isFinite(pLng)) {
      continue;
    }

    const serviceType = resolveOrderServiceType(order);
    if (
      !pickupWithinDriverRadius(dLat, dLng, pLat, pLng, serviceType)
    ) {
      continue;
    }

    if (
      order.offered_driver_id &&
      order.offered_driver_id !== driver.id &&
      !isOfferExpired(order.offered_at)
    ) {
      continue;
    }

    const dist = haversineKm(dLat, dLng, pLat, pLng);
    console.log(
      `[driver-rescue] NGOMOBIL order=${order.id} driver=${driver.id} dist=${dist.toFixed(2)}km`
    );

    const { error } = await admin
      .from("orders")
      .update({
        offered_driver_id: driver.id,
        offered_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .is("driver_id", null);

    if (!error) return order.id;
  }

  return null;
}
