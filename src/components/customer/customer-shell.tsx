"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";
import { CustomerModerationBanner } from "@/components/customer/customer-moderation-banner";

const NAV = [
  { href: "/customer", label: "Jelajah", icon: Home, match: (p: string) => p === "/customer" },
  {
    href: "/customer/cart",
    label: "Keranjang",
    icon: ShoppingBag,
    match: (p: string) => p.startsWith("/customer/cart"),
  },
  {
    href: "/customer/orders",
    label: "Pesanan",
    icon: MapPin,
    match: (p: string) => p.startsWith("/customer/orders"),
  },
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="wira-mesh min-h-[100dvh]">
      <header className="sticky top-0 z-50 border-b border-white/10 glass-panel">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/customer" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-orange-500 shadow-lg">
              <Sparkles className="h-4 w-4 text-slate-950" />
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <p className="text-sm font-bold tracking-tight text-white">WIRA</p>
                <p className="text-[10px] uppercase tracking-widest text-cyan-400/90">Kuliner</p>
              </div>
              <PoweredByDaffacell variant="header" />
            </div>
          </Link>
          <PoweredByDaffacell variant="hidden" />
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-300">
            3 km flat
          </span>
        </div>
      </header>

      <CustomerModerationBanner />
      <div className="safe-pb-nav mx-auto max-w-mobile">{children}</div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 glass-panel pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto flex max-w-mobile justify-around px-2 py-2">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-medium transition",
                  active
                    ? "bg-cyan-500/20 text-cyan-300 glow-ring"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-cyan-400")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
