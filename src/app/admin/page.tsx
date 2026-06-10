import { redirect } from "next/navigation";

/** Legacy `/admin` → dashboard tier-aware. */
export default function AdminRootPage() {
  redirect("/admin/dashboard");
}
