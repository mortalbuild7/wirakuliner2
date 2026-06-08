"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StoreOpenToggle } from "@/components/merchant/store-open-toggle";
import type { Merchant } from "@/types/database";
import { Package, ClipboardList, TrendingUp, Zap, BarChart3, Wallet } from "lucide-react";
import { formatIdr } from "@/lib/utils";

export default function MerchantDashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("merchants")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle()
        .then(({ data }) => setMerchant(data));
      fetch("/api/wallet/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { balance?: number } | null) => {
          if (j && typeof j.balance === "number") setWalletBalance(j.balance);
        })
        .catch(() => {});
    });
  }, [supabase]);

  return (
    <main className="p-4 md:p-6">
      {merchant && (
        <div className="mb-6">
          <StoreOpenToggle merchant={merchant} onChange={(open) => setMerchant({ ...merchant, is_open: open })} />
        </div>
      )}

      <div className="glass-card mb-6 overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">
              {merchant?.name?.trim() || "Toko"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kelola menu, kasir & pesanan masuk
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-amber-200/80">
              <Wallet className="h-4 w-4" />
              Saldo toko
            </p>
            <p className="mt-1 text-xl font-bold text-white">
              {walletBalance == null ? "—" : formatIdr(walletBalance)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <Link href="/merchant/pos" className="group">
          <article className="glass-card p-5 transition active:scale-[0.98] md:hover:border-amber-500/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Kasir On-The-Spot</h2>
            <p className="mt-1 text-sm text-muted-foreground">Walk-in: siapkan, bayar, cetak struk</p>
            <Button variant="outline" className="mt-4 border-amber-500/30 text-amber-300">
              Buka kasir
            </Button>
          </article>
        </Link>

        <Link href="/merchant/products" className="group">
          <article className="glass-card p-5 transition active:scale-[0.98] md:hover:border-orange-500/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
              <Package className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Produk & Menu</h2>
            <p className="mt-1 text-sm text-muted-foreground">CRUD menu, harga, foto</p>
            <Button variant="outline" className="mt-4 border-orange-500/30 text-orange-300">
              Kelola menu
            </Button>
          </article>
        </Link>

        <Link href="/merchant/reports" className="group">
          <article className="glass-card p-5 transition active:scale-[0.98] md:hover:border-violet-500/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Laporan Penjualan</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hari ini, 7 hari, bulan, tahun + print</p>
            <Button variant="outline" className="mt-4 border-violet-500/30 text-violet-300">
              Buka laporan
            </Button>
          </article>
        </Link>

        <Link href="/merchant/orders" className="group">
          <article className="glass-card p-5 transition active:scale-[0.98] md:hover:border-cyan-500/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-lg shadow-cyan-500/25">
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Pesanan Masuk</h2>
            <p className="mt-1 text-sm text-muted-foreground">Realtime + struk thermal</p>
            <Button variant="outline" className="mt-4 border-cyan-500/30 text-cyan-300">
              Buka pesanan
            </Button>
          </article>
        </Link>
      </div>

      <div className="glass-card mt-4 flex items-center gap-3 p-4">
        <TrendingUp className="h-8 w-8 shrink-0 text-orange-400" />
        <p className="text-xs text-muted-foreground">
          Tutup toko saat istirahat — customer tetap bisa <strong className="text-white">lihat</strong> menu, tidak bisa order.
        </p>
      </div>
    </main>
  );
}
