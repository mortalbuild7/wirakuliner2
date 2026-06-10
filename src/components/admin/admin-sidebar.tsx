"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  LogOut,
  MapPin,
  Shield,
  Store,
  Truck,
  FileText,
  Users,
  Settings2,
  Loader2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Analytics", icon: BarChart3, exact: true },
  { href: "/admin/merchants", label: "Merchants", icon: Store },
  { href: "/admin/drivers", label: "Drivers", icon: Truck },
  { href: "/admin/cities", label: "Kota Layanan", icon: MapPin },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/finance", label: "Keuangan", icon: Wallet },
  { href: "/admin/reports", label: "Laporan", icon: FileText },
  { href: "/admin/miscellaneous", label: "Miscellaneous", icon: Settings2 },
  { href: "/admin/security", label: "Keamanan & Sesi", icon: Shield },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function endSession() {
    if (!confirm("Akhiri sesi admin dan keluar?")) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Gagal mengakhiri sesi");
        return;
      }
      router.replace("/login?redirect=/admin");
      router.refresh();
    } catch {
      alert("Gagal mengakhiri sesi");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex w-full flex-col border-b bg-stone-900 text-white md:min-h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-2 p-4">
        <p className="font-bold">WIRA Admin</p>
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          title="Keluar"
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 md:hidden"
        >
          {loggingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Keluar
        </button>
      </div>

      <nav className="flex flex-1 flex-wrap gap-1 px-2 pb-2 md:flex-col">
        {NAV.map((item) => {
          const { href, label, icon: Icon } = item;
          const active =
            "exact" in item && item.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-white/15 text-white" : "hover:bg-white/10"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-3 md:block">
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/90 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
        >
          {loggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Keluar / Akhiri Sesi
        </button>
      </div>
    </aside>
  );
}
