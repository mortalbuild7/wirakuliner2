import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalDashboardSummary } from "@/components/admin/regional-dashboard-summary";
import { fetchDashboardStats } from "@/lib/admin/dashboard-stats";

export const dynamic = "force-dynamic";

/**
 * Dashboard utama WIRA Admin — https://wirakuliner.web.id/admin
 */
export default async function AdminDashboardPage() {
  const session = await verifyAdminSession();
  const stats = await fetchDashboardStats(session);

  return <RegionalDashboardSummary session={session} stats={stats} />;
}
