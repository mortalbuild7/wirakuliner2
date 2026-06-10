import { verifyAdminSession } from "@/app/utils/adminAuth";
import { DashboardDriversTable } from "@/components/admin/dashboard-drivers-table";
import {
  applyRegionalEntityScope,
  applyRegionalServiceCityScope,
  regionalScopeHint,
} from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** URL: /admin/drivers */
export default async function AdminDriversPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let driversQuery = supabase
    .from("drivers")
    .select("*, profiles(email, account_status), service_cities(name)")
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
    <DashboardDriversTable
      initialDrivers={drivers ?? []}
      initialCities={cities ?? []}
      scopeHint={regionalScopeHint(session)}
      adminTier={session.adminRole}
    />
  );
}
