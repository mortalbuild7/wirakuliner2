"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, MapPin, Sparkles, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";
import { CustomerModerationBanner } from "@/components/customer/customer-moderation-banner";
import { WalletBalanceBadge } from "@/components/wallet/wallet-balance-badge";
import { HelloWelcome } from "@/components/shared/HelloWelcome";
import { CustomerOrdersMonitorProvider } from "@/contexts/customer-orders-monitor-context";
import { CustomerNotificationTray } from "@/components/customer/customer-notification-tray";
import { CustomerActiveOrdersPanel } from "@/components/customer/customer-active-orders-panel";
import { useCustomerOrdersMonitor } from "@/contexts/customer-orders-monitor-context";

const NAV = [
  {
    href: "/customer",
    label: "Jelajah",
    icon: Home,
    match: (p: string) =>
      p === "/customer" ||
      p.startsWith("/customer/ride") ||
      p.startsWith("/customer/ngojek"),
  },
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

function CustomerNav() {
  const pathname = usePathname();
  const { activeOrders, totalChatUnread } = useCustomerOrdersMonitor();
  const badgeCount = activeOrders.length + totalChatUnread;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      <div className="mx-auto flex max-w-mobile justify-around px-3 py-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const showBadge = href === "/customer/orders" && badgeCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl px-3 py-2.5 text-[11px] font-semibold transition-all active:scale-95",
                active
                  ? "bg-emerald-50 text-emerald-800 glow-ring"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span className="relative">
                <Icon className={cn("h-5 w-5", active && "text-emerald-600")} />
                {showBadge ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                ) : null}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function CustomerShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [customerName, setCustomerName] = useState<string | null>(null);
  const supabase = createClient();
  const showCompactStrip =
    pathname !== "/customer" && !pathname?.startsWith("/customer/orders");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => setCustomerName(data?.name?.trim() || null));
    });
  }, [supabase]);

  return (
    <div className="customer-layout-root flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <HelloWelcome />
      <CustomerNotificationTray />

      <header className="customer-app-header shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/customer" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <p className="text-sm font-bold tracking-tight text-slate-900">WIRA</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
                  Kuliner
                </p>
              </div>
              <PoweredByDaffacell variant="header" />
            </div>
          </Link>
          <PoweredByDaffacell variant="hidden" />
          <div className="flex items-center gap-2">
            <WalletBalanceBadge href="/customer/wallet" />
            {customerName ? (
              <span
                className="flex max-w-[9rem] items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800 sm:max-w-[12rem]"
                title={customerName}
              >
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{customerName}</span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {showCompactStrip ? <CustomerActiveOrdersPanel variant="compact" /> : null}

      <main className="customer-scroll-layer mx-auto min-h-0 w-full max-w-mobile flex-1 overflow-y-auto safe-pb-nav">
        <CustomerModerationBanner />
        {children}
      </main>

      <CustomerNav />
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

/**
 * Layout customer — fase 1 (bongkar total):
 * - Header statis di flex (bukan fixed, bukan portal)
 * - Hanya <main> yang scroll
 */
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  return (
    <CustomerOrdersMonitorProvider userId={userId}>
      <CustomerShellInner>{children}</CustomerShellInner>
    </CustomerOrdersMonitorProvider>
  );
}
