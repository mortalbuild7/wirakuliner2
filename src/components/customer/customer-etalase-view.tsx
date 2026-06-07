"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { ProductMenuImage } from "@/components/customer/product-menu-image";
import { StoreStatusBadge } from "@/components/customer/store-status-badge";
import { buildMenuCoverMap, getMerchantEtalaseImage } from "@/lib/merchant-etalase";
import { isStoreOpen } from "@/lib/merchant-open";
import { Search, Zap, Eye } from "lucide-react";
import type { Merchant } from "@/types/database";
import { cn } from "@/lib/utils";
import { useMerchantListRealtime } from "@/hooks/use-merchant-realtime";

const CATEGORIES = ["semua", "makanan", "minuman", "snack", "umum"];

export function CustomerEtalaseView() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [menuCovers, setMenuCovers] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("semua");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: merchantRows } = await supabase
      .from("merchants")
      .select("*")
      .eq("is_active", true)
      .eq("admin_suspended", false)
      .eq("approval_status", "approved");

    setMerchants(merchantRows ?? []);

    const { data: menuPhotos } = await supabase
      .from("products")
      .select("merchant_id, image_url, updated_at")
      .eq("is_available", true)
      .not("image_url", "is", null)
      .order("updated_at", { ascending: false });

    setMenuCovers(buildMenuCoverMap(menuPhotos ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMerchantListRealtime(
    (updated) => {
      setMerchants((prev) =>
        prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      );
    },
    load
  );

  const filtered = merchants.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "semua" || m.category === category;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4">
      <section className="glass-card overflow-hidden p-4">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-cyan-400">
          <Zap className="h-3.5 w-3.5" /> Etalase WIRA
        </p>
        <h2 className="mt-1 text-2xl font-bold leading-tight text-white">
          Toko <span className="text-emerald-300">buka</span> bisa dipesan
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Toko tutup — etalase hanya untuk dilihat
        </p>
      </section>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400/70" />
        <Input
          className="h-12 rounded-2xl border-white/10 bg-white/5 pl-11 text-base placeholder:text-muted-foreground focus-visible:ring-cyan-500/50"
          placeholder="Cari restoran..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
              category === c
                ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/30"
                : "border border-white/10 bg-white/5 text-muted-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((m) => {
          const cover = getMerchantEtalaseImage(m, menuCovers);
          const open = isStoreOpen(m);

          const cardInner = (
            <article
              className={cn(
                "glass-card overflow-hidden transition",
                open ? "active:scale-[0.98]" : "opacity-75 saturate-50"
              )}
            >
              <div className="relative aspect-[4/3] bg-slate-800">
                <ProductMenuImage src={cover} alt={m.name} sizes="50vw" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <StoreStatusBadge merchant={m} className="absolute left-2 top-2" />
                {!open && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                    <span className="rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-200">
                      Hanya lihat
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-semibold text-white">{m.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {open ? `${m.name} sedang buka` : `${m.name} tutup`}
                </p>
                {!open && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-cyan-400/90">
                    <Eye className="h-3 w-3" />
                    Ketuk &quot;Lihat menu&quot; di bawah
                  </span>
                )}
              </div>
            </article>
          );

          if (open) {
            return (
              <Link key={m.id} href={`/customer/merchant/${m.id}`} className="group block">
                {cardInner}
              </Link>
            );
          }

          return (
            <div key={m.id} className="flex flex-col gap-2">
              {cardInner}
              <Link
                href={`/customer/merchant/${m.id}?view=1`}
                className="rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-medium text-cyan-300 hover:bg-white/10"
              >
                Lihat menu
              </Link>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada toko aktif</p>
      )}
    </div>
  );
}
