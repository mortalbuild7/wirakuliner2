export const dynamic = "force-dynamic";

import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
