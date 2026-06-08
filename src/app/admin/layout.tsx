export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { assertSuperAdminPage } from "@/lib/admin-auth";

/**
 * Lapisan 1 privilege escalation untuk seluruh subtree `/admin/*`.
 * Middleware sudah memeriksa role; layout ini memverifikasi ulang di Server Component
 * agar halaman tidak pernah di-render tanpa SUPER_ADMIN (defense in depth).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMfaFlow =
    pathname.startsWith("/admin/mfa-verify") ||
    pathname.startsWith("/admin/mfa-setup");

  await assertSuperAdminPage();

  if (isMfaFlow) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
