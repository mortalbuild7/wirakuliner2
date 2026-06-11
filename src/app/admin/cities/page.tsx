import { redirect } from "next/navigation";

/** Legacy URL → /admin/dashboard/cities */
export default function LegacyAdminCitiesPage() {
  redirect("/admin/dashboard/cities");
}
