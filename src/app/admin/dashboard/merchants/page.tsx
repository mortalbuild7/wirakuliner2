import { redirect } from "next/navigation";

/** Legacy URL → /admin/merchants */
export default function LegacyAdminMerchantsDashboardPage() {
  redirect("/admin/merchants");
}
