import { DriverRegistrationForm } from "@/components/admin/driver-registration-form";
import { getDriverNewPageProps } from "@/lib/admin/driver-new-page-props";

export const dynamic = "force-dynamic";

/**
 * URL: /dashboard/drivers/new — alias form pendaftaran driver (route group admin).
 * Logika identik dengan /admin/drivers/new; kota cabang dimuat per provinsi.
 */
export default async function DashboardDriverNewPage() {
  const props = await getDriverNewPageProps();

  return <DriverRegistrationForm {...props} />;
}
