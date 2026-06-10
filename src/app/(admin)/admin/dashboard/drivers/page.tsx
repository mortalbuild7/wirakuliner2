import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalDriversPanel } from "@/components/admin/regional-drivers-panel";
import {
  applyRegionalEntityScope,
  applyRegionalServiceCityScope,
  regionalScopeHint,
} from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Manajemen driver regional — Server Component.
 * Kueri awal difilter city_id / province_id sebelum data dikirim ke client (defense in depth).
 */
export default async function AdminDashboardDriversPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let driversQuery = supabase
    .from("drivers")
    .select("*, profiles(email), service_cities(name)")
    .order("created_at", { ascending: false });

  driversQuery = applyRegionalEntityScope(driversQuery, session);

  let citiesQuery = supabase
    .from("service_cities")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  citiesQuery = applyRegionalServiceCityScope(citiesQuery, session);

  const [{ data: drivers }, { data: cities }] = await Promise.all([
    driversQuery,
    citiesQuery,
  ]);

  return (
    <RegionalDriversPanel
      initialDrivers={drivers ?? []}
      initialCities={cities ?? []}
      scopeHint={regionalScopeHint(session)}
      adminTier={session.adminRole}
    />
  );
}
