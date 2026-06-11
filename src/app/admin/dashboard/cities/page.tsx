import { verifyAdminSession } from "@/app/utils/adminAuth";
import { CityManagementForm } from "@/components/admin/city-management-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Halaman Manajemen Kota — URL: /admin/dashboard/cities
 *
 * Guard: hanya SUPER_ADMIN (verifyAdminSession requireSuperAdmin).
 * Data:
 *   - `provinces`      → dropdown provinsi induk.
 *   - `service_cities` → daftar zona layanan aktif yang sudah terdaftar.
 */
export default async function AdminDashboardCitiesPage() {
  // ── 1. AUTENTIKASI: halaman tidak pernah di-render untuk non-SUPER_ADMIN. ─
  await verifyAdminSession({ requireSuperAdmin: true });

  const supabase = await createClient();

  // ── 2. PROVINSI INDUK: sumber dropdown form (tabel referensi `provinces`). ─
  const { data: provinces } = await supabase
    .from("provinces")
    .select("id, name")
    .order("name");

  // ── 3. ZONA LAYANAN: tampilkan semua service_cities aktif untuk monitoring. ─
  const { data: cities } = await supabase
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
