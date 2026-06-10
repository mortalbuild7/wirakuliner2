import { redirect } from "next/navigation";

/** Redirect legacy URL ke halaman dashboard regional. */
export default function LegacyAdminDriversPage() {
  redirect("/admin/dashboard/drivers");
}
