import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_ACTIVE_ORDER_STATUSES } from "@/lib/customer-active-order";
import { isTransitOrderRecord } from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import type { Order } from "@/types/database";

/** Pesanan transit aktif terbaru (NGOJEK / NGOMOBIL / PAKET) untuk banner beranda. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "customer-orders-active", RATE_LIMITS.api);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ order: null });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("orders")
    .select("id, order_status, delivery_address, service_type, driver_id, created_at, updated_at")
    .eq("customer_id", session.user.id)
    .in("order_status", CUSTOMER_ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return secureJsonResponse({ error: error.message ?? "Gagal memuat pesanan aktif" }, { status: 500 });
  }

  const order =
    (rows as Order[] | null)?.find((row) => isTransitOrderRecord(row)) ?? null;

  return secureJsonResponse({ order });
}
