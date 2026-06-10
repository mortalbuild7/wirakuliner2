import { redirect } from "next/navigation";

/** Legacy URL → /admin */
export default function LegacyAdminDashboardPage() {
  redirect("/admin");
}
