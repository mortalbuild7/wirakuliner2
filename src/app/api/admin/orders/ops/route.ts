import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { enrichOrderForOps } from "@/lib/admin-order-ops";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import type { Order } from "@/types/database";

const TRACK_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

/** Daftar order untuk monitoring admin (alur + deteksi masalah). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-orders-ops", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const filter = new URL(req.url).searchParams.get("filter") ?? "active";
  const admin = createAdminClient();

  let query = admin
    .from("orders")
    .select(
      "*, merchants(name, is_open, is_active, admin_suspended), profiles:customer_id(name, email), drivers(name)"
    )
    .order("created_at", { ascending: false })
    .limit(80);

  if (filter === "issues") {
    query = query.in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);
  } else if (filter === "active") {
    query = query.in("order_status", [
      "pending_payment",
      "paid",
      "preparing",
      "ready_for_pickup",
      "on_the_way",
    ]);
  } else {
    query = query.in("order_status", [...TRACK_STATUSES]);
  }

  const { data, error } = await query;

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  const rows = ((data as Order[]) ?? []).map((o) => enrichOrderForOps(o));
  const withIssues =
    filter === "issues" ? rows.filter((r) => r.issues.length > 0) : rows;

  return secureJsonResponse({
    orders: filter === "issues" ? withIssues : rows,
    issueCount: rows.filter((r) => r.issues.length > 0).length,
  });
}
