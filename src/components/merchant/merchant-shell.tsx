"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ClipboardList, Store, Zap, BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";
import { MerchantOrderAlert } from "@/components/merchant/merchant-order-alert";
import { MerchantOrderAlertProvider, useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

const NAV = [
  { href: "/merchant", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/merchant/pos", label: "Kasir", icon: Zap, exact: false },
  { href: "/merchant/products", label: "Menu", icon: Package, exact: false },
  { href: "/merchant/orders", label: "Order", icon: ClipboardList, exact: false },
  { href: "/merchant/reports", label: "Laporan", icon: BarChart3, exact: false },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  className,
  badge,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  className?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-amber-50 text-amber-800 glow-orange"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function MerchantShell({ children }: { children: React.ReactNode }) {
  return (
    <MerchantOrderAlertProvider>
      <MerchantShellInner>{children}</MerchantShellInner>
    </MerchantOrderAlertProvider>
  );
}

function MerchantShellInner({ children }: { children: React.ReactNode }) {
  const { pendingActionCount } = useMerchantOrderAlertContext();
  return (
    <MerchantShellContent pendingActionCount={pendingActionCount}>
      {children}
    </MerchantShellContent>
  );
}

function MerchantShellContent({
  children,
  pendingActionCount,
}: {
  children: React.ReactNode;
  pendingActionCount: number;
}) {
  const pathname = usePathname();
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("merchants")
        .select("name")
        .eq("owner_id", user.id)
        .maybeSingle()
        .then(({ data }) => setMerchantName(data?.name?.trim() || null));
    });
  }, [supabase]);

  const storeTitle = merchantName || "Toko";

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="wira-mesh min-h-[100dvh] text-slate-800 md:flex">
      <aside className="hidden border-r border-slate-200/80 bg-white shadow-sm md:flex md:w-56 md:flex-col md:shrink-0">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 shadow-lg shadow-amber-400/25">
            <Store className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-800" title={storeTitle}>
              {storeTitle}
            </p>
            <p className="text-[10px] font-medium text-amber-700">Panel merchant</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(item.href, item.exact)}
              badge={item.href === "/merchant/orders" ? pendingActionCount : undefined}
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 glass-panel">
          <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Store className="h-5 w-5 shrink-0 text-amber-500 md:hidden" />
              <p
                className="truncate font-bold text-slate-800 md:text-sm md:font-semibold"
                title={storeTitle}
              >
                {storeTitle}
              </p>
            </div>
            <PoweredByDaffacell variant="header" className="text-slate-400" />
          </div>
        </header>

        <MerchantOrderAlert />
        <div className="safe-pb-merchant flex-1">{children}</div>
        <PoweredByDaffacell variant="hidden" />

        <nav className="fixed bottom-0 left-0 right-0 z-50 glass-panel pb-[env(safe-area-inset-bottom,0px)] md:hidden">
          <div className="flex justify-around px-2 py-2">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              const badge =
                item.href === "/merchant/orders" ? pendingActionCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 rounded-2xl px-4 py-2.5 text-[11px] font-semibold transition-all active:scale-95",
                    active ? "text-amber-700" : "text-slate-500"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-amber-500")} />
                  {item.label}
                  {badge > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
