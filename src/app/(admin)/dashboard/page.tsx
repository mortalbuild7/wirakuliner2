import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalDashboardSummary } from "@/components/admin/regional-dashboard-summary";
import { RegionalSeedBanner } from "@/components/admin/regional-seed-banner";
import { fetchDashboardStats } from "@/lib/admin/dashboard-stats";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dashboard utama admin — URL: /dashboard (route group `(admin)`).
 *
 * Deteksi kosong: jika `provinces` atau `cities` count = 0, tampilkan
 * banner kuning SUPER_ADMIN dengan tombol seed `runRegionalMigrationSeed()`.
 */
export default async function AdminDashboardPage() {
  // ── 1. AUTENTIKASI: semua tier admin boleh melihat dashboard. ─────────────
  const session = await verifyAdminSession();
  const stats = await fetchDashboardStats(session);

  const supabase = await createClient();

  // ── 2. DETEKSI KOSONG: hitung provinsi & kota referensi wilayah. ───────────
  const [{ count: provinceCount }, { count: cityCount }] = await Promise.all([
    supabase.from("provinces").select("*", { count: "exact", head: true }),
    supabase.from("cities").select("*", { count: "exact", head: true }),
  ]);

  const needsRegionalSeed =
    (provinceCount ?? 0) === 0 || (cityCount ?? 0) === 0;

  return (
    <>
      {/* Banner hanya SUPER_ADMIN — UI masking di server sebelum render. */}
      {session.adminRole === "SUPER_ADMIN" && needsRegionalSeed && (
        <div className="px-6 pt-6">
          <RegionalSeedBanner />
        </div>
      )}
      <RegionalDashboardSummary session={session} stats={stats} />
    </>
  );
}
