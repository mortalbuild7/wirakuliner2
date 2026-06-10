export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { assertAdminPage } from "@/lib/admin-auth";

/**
 * Lapisan 1 privilege escalation untuk seluruh subtree `/admin/*`.
 * Middleware sudah memeriksa role; layout ini memverifikasi ulang di Server Component
 * agar halaman tidak pernah di-render tanpa tier admin valid + MFA (defense in depth).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMfaFlow =
    pathname.startsWith("/admin/mfa-verify") ||
    pathname.startsWith("/admin/mfa-setup") ||
    pathname.startsWith("/admin/mfa-challenge");

  const session = await assertAdminPage();

  if (isMfaFlow) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  const hiddenHrefs =
    session.adminRole !== "SUPER_ADMIN" ? ["/admin/finance"] : [];

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar hiddenHrefs={hiddenHrefs} />
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
