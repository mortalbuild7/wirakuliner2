export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { Sidebar } from "@/components/admin/Sidebar";
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
  const isAuthOnlyPage =
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/mfa-verify") ||
    pathname.startsWith("/admin/mfa-setup") ||
    pathname.startsWith("/admin/mfa-challenge");

  if (isAuthOnlyPage) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  await assertAdminPage();

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
