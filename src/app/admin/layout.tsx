export const dynamic = "force-dynamic";

import Link from "next/link";
import { BarChart3, Store, Truck, FileText } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="w-full border-b bg-stone-900 text-white md:w-56 md:border-b-0">
        <p className="p-4 font-bold">WIRA Admin</p>
        <nav className="flex flex-wrap gap-1 px-2 pb-4 md:flex-col">
          <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            <BarChart3 className="h-4 w-4" /> Analytics
          </Link>
          <Link href="/admin/merchants" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            <Store className="h-4 w-4" /> Merchants
          </Link>
          <Link href="/admin/drivers" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            <Truck className="h-4 w-4" /> Drivers
          </Link>
          <Link href="/admin/reports" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            <FileText className="h-4 w-4" /> Laporan
          </Link>
        </nav>
      </aside>
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
