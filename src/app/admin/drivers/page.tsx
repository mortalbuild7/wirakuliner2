import { verifyAdminSession } from "@/app/utils/adminAuth";
import { DashboardDriversTable } from "@/components/admin/dashboard-drivers-table";
import {
  fetchAdminDriverServiceCities,
  fetchAdminDriversList,
  getDriverFilterProvinces,
} from "@/lib/admin/drivers-list";
import { regionalScopeHint } from "@/lib/admin/regional-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** URL: /admin/drivers */
export default async function AdminDriversPage() {
  const session = await verifyAdminSession();

  const [{ drivers, error: driversError }, { cities }] = await Promise.all([
    fetchAdminDriversList(session),
    fetchAdminDriverServiceCities(session),
  ]);

  if (driversError) {
    console.error("Gagal memuat driver (SSR):", driversError);
  }

  const isCityAdmin = session.adminRole === "CITY_ADMIN";

  return (
    <DashboardDriversTable
      initialDrivers={drivers}
      initialCities={cities}
      scopeHint={regionalScopeHint(session)}
      adminTier={session.adminRole}
      isSuperAdmin={session.adminRole === "SUPER_ADMIN"}
      isCityAdmin={isCityAdmin}
      lockedProvinceId={isCityAdmin ? session.provinceId : null}
      lockedCityId={isCityAdmin ? session.cityId : null}
      lockedCityName={isCityAdmin ? session.cityName : null}
      provinces={getDriverFilterProvinces()}
    />
  );
}
