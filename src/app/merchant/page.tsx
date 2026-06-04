import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Package, ClipboardList, TrendingUp, Radio } from "lucide-react";

export default function MerchantDashboardPage() {
  return (
    <main className="p-4 md:p-6">
      <div className="glass-card mb-6 overflow-hidden p-5">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-orange-400">
          <Radio className="h-3.5 w-3.5 animate-pulse" /> Live dashboard
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">Merchant Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kelola menu & pesanan masuk secara realtime
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/merchant/products" className="group">
          <article className="glass-card p-5 transition active:scale-[0.98] md:hover:border-orange-500/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
              <Package className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Produk & Menu</h2>
            <p className="mt-1 text-sm text-muted-foreground">CRUD menu, harga, ketersediaan</p>
            <Button variant="outline" className="mt-4 border-orange-500/30 text-orange-300">
              Kelola menu
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
        <TrendingUp className="h-8 w-8 text-orange-400" />
        <p className="text-xs text-muted-foreground">
          Tip: pastikan produk <strong className="text-white">tersedia</strong> agar muncul di app customer.
        </p>
      </div>
    </main>
  );
}
