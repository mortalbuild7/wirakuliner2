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
  MapPinned,
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

export type SidebarNavItem =
  | { kind: "section"; label: string }
  | {
      kind: "item";
      href: string;
      label: string;
      exact?: boolean;
      badge?: string;
    };

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/admin": BarChart3,
  "/admin/maps": Map,
  "/admin/drivers/verification": FileCheck,
  "/admin/tariffs": SlidersHorizontal,
  "/admin/recruit": UserPlus,
  "/admin/company-bank": Landmark,
  "/admin/orders": ClipboardList,
  "/admin/merchants": Store,
  "/admin/drivers": Truck,
  "/admin/customers": Users,
  "/admin/dashboard/cities": MapPinned,
};

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
    <aside className="flex w-full flex-col border-b border-slate-200/80 bg-white text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="border-b border-slate-100 p-5">
        <Link
          href="/admin"
          className="text-lg font-bold tracking-tight text-slate-800 hover:text-emerald-600"
        >
          WIRA Admin
        </Link>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
          {tierLabel}
        </p>
        <p className="text-xs text-slate-500">{scopeLabel}</p>
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/20 transition-all active:scale-95 md:hidden"
        >
          {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Keluar
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item, idx) => {
          if (item.kind === "section") {
            return (
              <p
                key={`section-${item.label}-${idx}`}
                className="mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0"
              >
                {item.label}
              </p>
            );
          }

          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = ICON_BY_HREF[item.href] ?? BarChart3;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition-all",
                active
                  ? "bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/60"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-800">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-slate-100 p-4 md:block">
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95 disabled:opacity-60"
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
