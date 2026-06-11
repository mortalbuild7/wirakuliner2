import { verifyAdminSession } from "@/app/utils/adminAuth";
import { CityManagementForm } from "@/components/admin/city-management-form";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Halaman Manajemen Kota — URL: /admin/dashboard/cities
 *
 * Guard: hanya SUPER_ADMIN (verifyAdminSession requireSuperAdmin).
 * Data dibaca via service role agar tidak terblokir RLS pada tabel referensi.
 */
export default async function AdminDashboardCitiesPage() {
  // ── 1. AUTENTIKASI: halaman tidak pernah di-render untuk non-SUPER_ADMIN. ─
  await verifyAdminSession({ requireSuperAdmin: true });

  // ── 2. SERVICE ROLE: bypass RLS untuk baca `provinces` / `service_cities`. ─
  const admin = createAdminClient();

  const { data: provinces } = await admin
    .from("provinces")
    .select("id, name")
    .order("name");

  const { data: cities } = await admin
    .from("service_cities")
    .select(
      "id, name, slug, province_id, city_id, radius_km, is_active, provinces(name)"
    )
    .order("name");

  return (
    <CityManagementForm
      provinces={provinces ?? []}
      initialCities={cities ?? []}
    />
  );
}
