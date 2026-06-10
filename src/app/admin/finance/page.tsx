import { FinanceDashboard } from "@/components/admin/finance-dashboard";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import {
  fetchAppWithdrawals,
  fetchFinanceSummary,
  fetchFinancialLogs,
} from "@/lib/app-finance";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Panel keuangan aplikasi — Server Component.
 *
 * Lapisan keamanan:
 * 1. `assertSuperAdminPage()` — RBAC SUPER_ADMIN dari JWT + profiles (bukan client)
 * 2. `getSupabaseAdmin()` — service role; tabel finance tidak punya RLS client
 * 3. Agregat dihitung di server; masking nominal dilakukan di Client Component
 */
export default async function AdminFinancePage() {
  await verifyAdminSession({ requireSuperAdmin: true });

  const admin = getSupabaseAdmin();

  const [summary, logs, withdrawals] = await Promise.all([
    fetchFinanceSummary(admin),
    fetchFinancialLogs(admin, { limit: 50 }),
    fetchAppWithdrawals(admin, 15),
  ]);

  return (
    <main className="p-6">
      <FinanceDashboard
        initialSummary={summary}
        initialLogs={logs}
        initialWithdrawals={withdrawals}
      />
    </main>
  );
}
