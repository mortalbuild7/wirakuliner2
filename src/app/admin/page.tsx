import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalDashboardSummary } from "@/components/admin/regional-dashboard-summary";
import { RegionalSeedBanner } from "@/components/admin/regional-seed-banner";
import { fetchDashboardStats } from "@/lib/admin/dashboard-stats";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Dashboard utama WIRA Admin — https://wirakuliner.web.id/admin
 *
 * Jika tabel `provinces` / `cities` kosong, SUPER_ADMIN melihat banner
 * kuning untuk menjalankan seed regional via `runRegionalMigrationSeed()`.
 */
export default async function AdminDashboardPage() {
  const session = await verifyAdminSession();
  const stats = await fetchDashboardStats(session);

  const admin = createAdminClient();

  const [prov, city, svc] = await Promise.all([
    admin.from("provinces").select("*", { count: "exact", head: true }),
    admin.from("cities").select("*", { count: "exact", head: true }),
    admin.from("service_cities").select("*", { count: "exact", head: true }),
  ]);

  const needsRegionalSeed =
    (prov.count ?? 0) < 4 ||
    (city.count ?? 0) < 6 ||
    (svc.count ?? 0) < 6;

  return (
    <>
      {session.adminRole === "SUPER_ADMIN" && needsRegionalSeed && (
        <div className="px-6 pt-6">
          <RegionalSeedBanner />
        </div>
      )}
      <RegionalDashboardSummary session={session} stats={stats} />
    </>
  );
}
