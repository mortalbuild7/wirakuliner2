import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildSalesReport,
  getReportDateRange,
  SALES_ORDER_STATUSES,
  type ReportPeriod,
} from "@/lib/sales-report";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const PERIODS = ["today", "7d", "30d", "365d"] as const;

/** Laporan penjualan merchant — bypass RLS (hindari rekursi negotiations). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-reports", RATE_LIMITS.api);
  if (rl) return rl;

  const period = (new URL(req.url).searchParams.get("period") ?? "today") as ReportPeriod;
  if (!PERIODS.includes(period as (typeof PERIODS)[number])) {
    return secureJsonResponse({ error: "Periode tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, name")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (!merchant) {
    return secureJsonResponse({ error: "Data toko tidak ditemukan" }, { status: 404 });
  }

  const { start, end } = getReportDateRange(period);
  const { data: orders, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("merchant_id", merchant.id)
    .in("order_status", [...SALES_ORDER_STATUSES])
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return secureJsonResponse({ error: error.message ?? "Gagal memuat laporan" }, { status: 500 });
  }

  const report = buildSalesReport(merchant.name, period, orders ?? []);
  return secureJsonResponse({ report });
}
