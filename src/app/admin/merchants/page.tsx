import { redirect } from "next/navigation";

/** Redirect legacy URL ke halaman dashboard regional. */
export default function LegacyAdminMerchantsPage() {
  redirect("/admin/dashboard/merchants");
}
