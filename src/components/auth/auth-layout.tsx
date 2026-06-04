"use client";

import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  badge,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="wira-mesh flex min-h-[100dvh] flex-col">
      <header className="border-b border-white/10 glass-panel">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Beranda</span>
          </Link>
          <Link href="/customer" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-orange-500 shadow-lg">
              <Sparkles className="h-4 w-4 text-slate-950" />
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-white">WIRA</p>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400/90">Kuliner</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-mobile">
          <div className="glass-card glow-ring overflow-hidden p-6 md:p-8">
            {badge && (
              <span className="mb-3 inline-block rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                {badge}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            )}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 border-t border-white/10 pt-6">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const authInputClass =
  "h-12 rounded-xl border-white/10 bg-white/5 text-base placeholder:text-muted-foreground focus-visible:ring-cyan-500/50";

export function AuthSubmitButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        "flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 transition active:scale-[0.98] disabled:opacity-60"
      )}
    >
      {loading ? "Memuat..." : children}
    </button>
  );
}

export function RoleTabs({
  active,
}: {
  active: "customer" | "merchant";
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
      <Link
        href="/register?role=customer"
        className={cn(
          "rounded-xl py-2.5 text-center text-sm font-medium transition",
          active === "customer"
            ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 shadow-md"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Customer
      </Link>
      <Link
        href="/register?role=merchant"
        className={cn(
          "rounded-xl py-2.5 text-center text-sm font-medium transition",
          active === "merchant"
            ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Merchant
      </Link>
    </div>
  );
}
