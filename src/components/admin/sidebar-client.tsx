"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileCheck,
  Landmark,
  Loader2,
  LogOut,
  Map,
  SlidersHorizontal,
  Store,
  Truck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminTier } from "@/app/utils/adminAuth";

export type SidebarNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  badge?: string;
};

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/admin/dashboard": BarChart3,
  "/admin/dashboard/maps": Map,
  "/admin/drivers/verification": FileCheck,
  "/admin/tariffs": SlidersHorizontal,
  "/admin/recruit": UserPlus,
  "/admin/company-bank": Landmark,
  "/admin/orders": ClipboardList,
  "/admin/merchants": Store,
  "/admin/drivers": Truck,
  "/admin/customers": Users,
};

/** Client shell — pathname aktif + logout; item sudah difilter server-side. */
export function SidebarClient({
  items,
  tierLabel,
  scopeLabel,
}: {
  items: SidebarNavItem[];
  tierLabel: string;
  scopeLabel: string;
}) {
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
      router.replace("/admin/login");
      router.refresh();
    } catch {
      alert("Gagal mengakhiri sesi");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex w-full flex-col border-b border-stone-800 bg-stone-900 text-white md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="border-b border-white/10 p-4">
        <p className="font-bold tracking-tight">WIRA Admin</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-amber-300/90">
          {tierLabel}
        </p>
        <p className="text-[11px] text-stone-400">{scopeLabel}</p>
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium md:hidden"
        >
          {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Keluar
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = ICON_BY_HREF[item.href] ?? BarChart3;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition",
                active ? "bg-amber-500/20 text-amber-50" : "text-stone-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge && (
                <span className="shrink-0 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-200">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-3 md:block">
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/90 px-3 py-2.5 text-sm font-medium transition hover:bg-red-600 disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Keluar
        </button>
      </div>
    </aside>
  );
}

export const TIER_LABEL: Record<AdminTier, string> = {
  SUPER_ADMIN: "Super Admin",
  PROVINCE_ADMIN: "Province Admin",
  CITY_ADMIN: "City Admin",
};
