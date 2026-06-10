import { redirect } from "next/navigation";

/** Legacy URL → /admin/drivers */
export default function LegacyAdminDriversDashboardPage() {
  redirect("/admin/drivers");
}
