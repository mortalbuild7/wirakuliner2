"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const HEADER_FALLBACK_PX = 72;

function CustomerAppHeader({ customerName }: { customerName: string | null }) {
  return (
    <header className="customer-app-header customer-app-header-portal border-b border-slate-200 bg-white shadow-sm">
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
  );
}

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [headerHeightPx, setHeaderHeightPx] = useState(HEADER_FALLBACK_PX);
  const headerMeasureRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useLayoutEffect(() => {
    document.documentElement.classList.add("customer-app-active");
    setPortalReady(true);
    return () => {
      document.documentElement.classList.remove("customer-app-active");
      setPortalReady(false);
    };
  }, []);

  useLayoutEffect(() => {
    const el = headerMeasureRef.current;
    if (!el) return;

    const sync = () => setHeaderHeightPx(Math.ceil(el.getBoundingClientRect().height));
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [portalReady, customerName]);

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

  const headerPortal =
    portalReady &&
    createPortal(
      <CustomerAppHeader customerName={customerName} />,
      document.body
    );

  return (
    <div
      className="customer-layout-root flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900"
      style={{ "--customer-header-height": `${headerHeightPx}px` } as React.CSSProperties}
    >
      {headerPortal}

      {/* Spacer ukuran header — header asli di-portal ke body */}
      <div
        ref={headerMeasureRef}
        className="customer-header-measure pointer-events-none invisible absolute left-0 top-0 w-full"
        aria-hidden
      >
        <CustomerAppHeader customerName={customerName} />
      </div>
      <div
        className="customer-header-spacer shrink-0"
        style={{ height: headerHeightPx }}
        aria-hidden
      />

      <HelloWelcome />

      <main className="customer-scroll-layer relative z-0 mx-auto min-h-0 w-full max-w-mobile flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain safe-pb-nav">
        <div className="customer-scroll-content relative z-0">
          <CustomerModerationBanner />
          {children}
        </div>
      </main>

      <nav className="customer-bottom-nav fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-mobile justify-around px-3 py-2">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl px-3 py-2.5 text-[11px] font-semibold transition-all active:scale-95",
                  active
                    ? "bg-emerald-50 text-emerald-800 glow-ring"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-emerald-600")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
