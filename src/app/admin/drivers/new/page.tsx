import { verifyAdminSession } from "@/app/utils/adminAuth";
import { applyRegionalServiceCityScope, regionalScopeHint } from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";
import { DriverRegistrationForm } from "@/components/admin/driver-registration-form";

export const dynamic = "force-dynamic";

/**
 * URL: /admin/drivers/new — form pendaftaran driver nasional.
 *
 * Server Component wrapper:
 * - Sesi admin diverifikasi SEBELUM render (redirect bila tidak sah).
 * - Dropdown kota layanan sudah difilter server-side sesuai yurisdiksi —
 *   CITY_ADMIN hanya melihat kotanya sendiri (terkunci otomatis di form).
 */
export default async function AdminDriverNewPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  // Kota layanan aktif dalam lingkup admin (RLS + filter presisi server).
  let citiesQuery = supabase
    .from("service_cities")
    .select("id, name, province_id, city_id")
    .eq("is_active", true)
    .order("name");
  citiesQuery = applyRegionalServiceCityScope(citiesQuery, session);

  const { data: cities } = await citiesQuery;

  return (
    <DriverRegistrationForm
      cities={cities ?? []}
      adminTier={session.adminRole}
      scopeHint={regionalScopeHint(session)}
      // Wilayah terkunci bila bukan SUPER_ADMIN (admin regional tidak bisa
      // memilih wilayah lain — input kota dikunci di UI + dicek ulang server).
      regionLocked={session.adminRole !== "SUPER_ADMIN"}
    />
  );
}
