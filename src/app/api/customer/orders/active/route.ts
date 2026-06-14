import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  CUSTOMER_ACTIVE_ORDER_STATUSES,
  isCustomerActiveOrderStatus,
} from "@/lib/customer-active-order";
import {
  channelLabelFromRecord,
  customerTrackerStatusLabel,
} from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { merchantNameFromJoin } from "@/lib/utils";
import type { Order } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveOrderRow = Pick<
  Order,
  | "id"
  | "order_status"
  | "delivery_address"
  | "service_type"
  | "driver_id"
  | "created_at"
  | "updated_at"
> & {
  merchants?: { name: string } | { name: string }[] | null;
};

function mapActiveOrder(row: ActiveOrderRow) {
  const merchant_name = merchantNameFromJoin(row.merchants, undefined);
  const base = {
    id: row.id,
    order_status: row.order_status,
    delivery_address: row.delivery_address,
    service_type: row.service_type,
    driver_id: row.driver_id,
    merchant_name,
    channel_label: channelLabelFromRecord(row),
    status_label: customerTrackerStatusLabel({
      delivery_address: row.delivery_address,
      service_type: row.service_type,
      order_status: row.order_status,
      driver_id: row.driver_id,
    }),
  };
  return base;
}

/** Semua pesanan aktif customer (maks. 20) — makanan + transit sekaligus. */
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
    return secureJsonResponse({ orders: [], order: null });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("orders")
    .select(
      "id, order_status, delivery_address, service_type, driver_id, created_at, updated_at, merchants(name)"
    )
    .eq("customer_id", session.user.id)
    .in("order_status", CUSTOMER_ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return secureJsonResponse(
      { error: error.message ?? "Gagal memuat pesanan aktif" },
      { status: 500 }
    );
  }

  const orders = ((rows as ActiveOrderRow[] | null) ?? [])
    .filter((row) => isCustomerActiveOrderStatus(row.order_status))
    .map(mapActiveOrder);

  const res = secureJsonResponse({
    orders,
    order: orders[0] ?? null,
  });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}
