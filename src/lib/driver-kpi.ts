import type { SupabaseClient } from "@supabase/supabase-js";

export type DriverKpiEvent =
  | "offer_sent"
  | "offer_accepted"
  | "offer_declined"
  | "order_completed"
  | "order_cancelled_after_accept";

/** Catat mutasi KPI harian via RPC PostgreSQL (non-blocking best-effort). */
export async function recordDriverKpiEvent(
  admin: SupabaseClient,
  driverId: string,
  event: DriverKpiEvent
): Promise<void> {
  if (!driverId) return;
  await admin.rpc("record_driver_kpi_event", {
    p_driver_id: driverId,
    p_event: event,
  });
}
