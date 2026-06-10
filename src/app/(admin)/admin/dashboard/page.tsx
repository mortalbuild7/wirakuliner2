import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalDashboardSummary } from "@/components/admin/regional-dashboard-summary";
import { fetchDashboardStats } from "@/lib/admin/dashboard-stats";

export const dynamic = "force-dynamic";

/**
 * Dashboard utama admin — data & layout dinamis per tier.
 *
 * Lapisan keamanan (defense in depth):
 * 1. Middleware — blok customer/driver dari `/admin/*`
 * 2. `verifyAdminSession()` — JWT server + profiles.role + MFA
 * 3. RLS Supabase — query ter-scope provinsi/kota untuk admin regional
 * 4. `fetchDashboardStats()` — filter tambahan server-side per tier
 */
export default async function AdminDashboardPage() {
  const session = await verifyAdminSession();
  const stats = await fetchDashboardStats(session);

  return <RegionalDashboardSummary session={session} stats={stats} />;
}
