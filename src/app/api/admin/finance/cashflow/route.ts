import { requireSuperAdmin } from "@/lib/admin-auth";
import { cashflowDateFilterSchema } from "@/lib/admin/finance-schemas";
import { fetchFinancialLogs } from "@/lib/app-finance";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-finance-cashflow", RATE_LIMITS.admin);
  if (rl) return rl;

  const auth = await requireSuperAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const filterParsed = cashflowDateFilterSchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  if (!filterParsed.success) {
    const msg = filterParsed.error.issues.map((i) => i.message).join("; ");
    return secureJsonResponse({ error: msg }, { status: 400 });
  }

  const { from, to } = filterParsed.data;
  const admin = getSupabaseAdmin();

  const logs = await fetchFinancialLogs(admin, {
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    limit: 200,
  });

  return secureJsonResponse({ logs });
}
