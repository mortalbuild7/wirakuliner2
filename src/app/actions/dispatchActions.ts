"use server";

/**
 * Server Actions — Order Dispatching System (KPI + FCM)
 *
 * Alur matematika dispatch:
 * 1. RPC `find_nearest_priority_drivers` menghitung jarak Haversine + skor KPI 7 hari.
 * 2. Skor = (completion×100×0.4) + (acceptance×100×0.3) + (rating×20×0.3).
 * 3. Driver indeks 0 (skor tertinggi) ditawari order via `offered_driver_id`.
 * 4. FCM menembak kartu order ke HP driver tersebut.
 * 5. Jika 15 detik tanpa respons / ditolak → rotasi ke indeks 1, 2, … (skip list).
 */

import {
  declineAndRedispatch,
  dispatchOrderOffer,
  findPriorityDrivers,
  processExpiredOffersAndDispatch,
  resolveDispatchOrigin,
  rotateAndDispatchOrder,
  type PriorityDriverRow,
} from "@/lib/driver-dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/security/validate";

export type DispatchActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Tawarkan order baru ke driver KPI terbaik + FCM. */
export async function dispatchOrderOfferAction(
  orderId: string
): Promise<DispatchActionResult<{ driverId: string | null; priorityScore?: number }>> {
  if (!isValidUuid(orderId)) {
    return { ok: false, error: "Order tidak valid" };
  }

  try {
    const result = await dispatchOrderOffer(orderId);
    return {
      ok: true,
      data: {
        driverId: result?.driverId ?? null,
        priorityScore: result?.priorityScore,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal dispatch order",
    };
  }
}

/** Paksa rotasi penawaran (mis. setelah driver menolak). */
export async function rotateOrderOfferAction(
  orderId: string
): Promise<DispatchActionResult<{ driverId: string | null }>> {
  if (!isValidUuid(orderId)) {
    return { ok: false, error: "Order tidak valid" };
  }

  try {
    const result = await rotateAndDispatchOrder(orderId, true);
    return { ok: true, data: { driverId: result?.driverId ?? null } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal rotasi penawaran",
    };
  }
}

/** Poll timeout — rotasi semua penawaran kedaluwarsa + FCM driver berikutnya. */
export async function processExpiredOffersAction(): Promise<DispatchActionResult> {
  try {
    await processExpiredOffersAndDispatch();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal memproses penawaran",
    };
  }
}

/** Driver menolak — KPI decline + rotasi + FCM. */
export async function declineDriverOfferAction(
  orderId: string,
  driverId: string
): Promise<DispatchActionResult<{ nextDriverId: string | null }>> {
  if (!isValidUuid(orderId) || !isValidUuid(driverId)) {
    return { ok: false, error: "Parameter tidak valid" };
  }

  const result = await declineAndRedispatch(orderId, driverId);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Gagal menolak penawaran" };
  }

  return {
    ok: true,
    data: { nextDriverId: result.nextDriverId ?? null },
  };
}

/** Preview daftar driver prioritas (admin/debug) — tidak mengubah state order. */
export async function previewPriorityDriversAction(
  orderId: string
): Promise<DispatchActionResult<{ drivers: PriorityDriverRow[] }>> {
  if (!isValidUuid(orderId)) {
    return { ok: false, error: "Order tidak valid" };
  }

  const admin = createAdminClient();
  const origin = await resolveDispatchOrigin(admin, orderId);
  if (!origin) {
    return { ok: false, error: "Titik dispatch order tidak ditemukan" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("offer_skip_driver_ids")
    .eq("id", orderId)
    .maybeSingle();

  try {
    const drivers = await findPriorityDrivers(admin, {
      lat: origin.lat,
      lng: origin.lng,
      serviceCityId: origin.serviceCityId,
      skipDriverIds: (order?.offer_skip_driver_ids as string[] | null) ?? [],
    });
    return { ok: true, data: { drivers } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal memuat prioritas driver",
    };
  }
}
