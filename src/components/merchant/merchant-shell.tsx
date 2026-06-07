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
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-orange-500/20 text-orange-300 glow-orange"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function MerchantShell({ children }: { children: React.ReactNode }) {
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
    <div className="wira-mesh min-h-[100dvh] md:flex">
      <aside className="hidden border-r border-white/10 glass-panel md:flex md:w-56 md:flex-col md:shrink-0">
        <div className="flex items-center gap-2 border-b border-white/10 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
            <Store className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-white" title={storeTitle}>
              {storeTitle}
            </p>
            <p className="text-[10px] text-orange-300/80">Panel merchant</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(item.href, item.exact)}
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 glass-panel">
          <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Store className="h-5 w-5 shrink-0 text-orange-400 md:hidden" />
              <p
                className="truncate font-bold text-white md:text-sm md:font-semibold md:text-white/90"
                title={storeTitle}
              >
                {storeTitle}
              </p>
            </div>
            <PoweredByDaffacell variant="header" className="text-orange-300/50" />
          </div>
        </header>

        <MerchantOrderAlert />
        <div className="safe-pb-merchant flex-1">{children}</div>
        <PoweredByDaffacell variant="hidden" />

        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 glass-panel pb-[env(safe-area-inset-bottom,0px)] md:hidden">
          <div className="flex justify-around px-2 py-2">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl px-4 py-2 text-[10px]",
                    active ? "text-orange-300" : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-orange-400")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
