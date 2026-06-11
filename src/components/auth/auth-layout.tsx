"use client";

import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";

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
    <div className="wira-mesh flex min-h-[100dvh] flex-col text-slate-800">
      <header className="glass-panel">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Beranda</span>
          </Link>
          <Link href="/customer" className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-amber-400 shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-800">WIRA Kuliner</p>
              <PoweredByDaffacell variant="header" />
            </div>
          </Link>
          <PoweredByDaffacell variant="hidden" />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-mobile">
          <div className="glass-card glow-ring overflow-hidden p-6 md:p-8">
            {badge && (
              <span className="mb-3 inline-block rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                {badge}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 border-t border-slate-100 pt-6">{footer}</div>}
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
      <label htmlFor={id} className="text-sm font-medium text-slate-600">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const authInputClass =
  "h-12 rounded-2xl border-slate-200/60 bg-slate-50 text-base text-slate-800 placeholder:text-slate-400 focus-visible:ring-emerald-500/20 focus-visible:shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]";

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
        "flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all active:scale-95 hover:bg-emerald-600 disabled:opacity-60"
      )}
    >
      {loading ? "Memproses..." : children}
    </button>
  );
}

export function RoleTabs({ active }: { active: "customer" | "merchant" }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-1">
      <Link
        href="/register?role=customer"
        className={cn(
          "rounded-2xl py-3 text-center text-sm font-semibold transition-all active:scale-95",
          active === "customer"
            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
            : "text-slate-500 hover:bg-white hover:text-slate-700"
        )}
      >
        Customer
      </Link>
      <Link
        href="/register?role=merchant"
        className={cn(
          "rounded-2xl py-3 text-center text-sm font-semibold transition-all active:scale-95",
          active === "merchant"
            ? "bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/25"
            : "text-slate-500 hover:bg-white hover:text-slate-700"
        )}
      >
        Merchant
      </Link>
    </div>
  );
}
