import { redirect } from "next/navigation";

/** Legacy URL → /admin/maps */
export default function LegacyAdminMapsPage() {
  redirect("/admin/maps");
}
