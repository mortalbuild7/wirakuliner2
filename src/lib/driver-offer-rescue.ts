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
import { MOBIL_PICKUP_RADIUS_KM } from "@/lib/jabodetabek-policy";
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

type MobilDriverRow = {
  id: string;
  status: string;
  service_category: string | null;
  current_lat: number | null;
  current_lng: number | null;
  gps_trust: string | null;
};

function parseCoord(value: unknown): number | null {
  const n = parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return null;
  return n;
}

/** Cari driver mobil idle terdekat — abaikan gps_trust SUSPICIOUS (testing HP fisik). */
export async function findNearestIdleMobilDriver(
  admin: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  radiusKm = MOBIL_PICKUP_RADIUS_KM
): Promise<{ driverId: string; distanceKm: number } | null> {
  const { data, error } = await admin
    .from("drivers")
    .select("id, status, service_category, current_lat, current_lng, gps_trust")
    .eq("status", "idle")
    .in("service_category", ["MOBIL_PASSENGER", "MOBIL_CARGO", "MOTOR_HYBRID"])
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);

  if (error || !data?.length) return null;

  let best: { driverId: string; distanceKm: number } | null = null;
  for (const row of data as MobilDriverRow[]) {
    const dLat = parseCoord(row.current_lat);
    const dLng = parseCoord(row.current_lng);
    if (dLat == null || dLng == null) continue;

    const dist = haversineKm(pickupLat, pickupLng, dLat, dLng);
    if (dist > radiusKm) continue;
    if (!best || dist < best.distanceKm) {
      best = { driverId: row.id, distanceKm: dist };
    }
  }

  return best;
}

/** Paksa tawarkan order NGOMOBIL ke driver mobil terdekat (bypass PostGIS/SUSPICIOUS). */
export async function forceAssignNgomobilOrder(
  admin: SupabaseClient,
  orderId: string
): Promise<string | null> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, pickup_lat, pickup_lng, service_type, delivery_address, driver_id, offered_driver_id, offered_at, order_status"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.driver_id) return null;
  if (!isNgomobilIncomingOrder(order)) return null;
  if (!isDriverIncomingOrderStatus(order.order_status)) return null;
  if (isOnsiteOrder(order.delivery_address ?? "")) return null;

  if (
    order.offered_driver_id &&
    !isOfferExpired(order.offered_at)
  ) {
    return order.offered_driver_id;
  }

  const pLat = parseCoord(order.pickup_lat);
  const pLng = parseCoord(order.pickup_lng);
  if (pLat == null || pLng == null) return null;

  const nearest = await findNearestIdleMobilDriver(admin, pLat, pLng);
  if (!nearest) return null;

  const { error } = await admin
    .from("orders")
    .update({
      offered_driver_id: nearest.driverId,
      offered_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("driver_id", null);

  if (error) {
    console.error("[forceAssignNgomobilOrder]", error.message);
    return null;
  }

  console.log(
    `[forceAssignNgomobilOrder] order=${orderId} driver=${nearest.driverId} dist=${nearest.distanceKm.toFixed(2)}km`
  );
  return nearest.driverId;
}

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
    if (!pickupWithinDriverRadius(dLat, dLng, pLat, pLng, serviceType)) {
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

    const { data: updated, error } = await admin
      .from("orders")
      .update({
        offered_driver_id: driver.id,
        offered_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .is("driver_id", null)
      .select("id")
      .maybeSingle();

    if (!error && updated?.id) return order.id;
  }

  return null;
}
