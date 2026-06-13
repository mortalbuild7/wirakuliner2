"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { ProductMenuImage } from "@/components/customer/product-menu-image";
import { StoreStatusBadge } from "@/components/customer/store-status-badge";
import { buildMenuCoverMap, getMerchantEtalaseImage } from "@/lib/merchant-etalase";
import { isStoreOpen } from "@/lib/merchant-open";
import { Search, Eye } from "lucide-react";
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

    const params = new URLSearchParams({
      type: "merchants",
      limit: "40",
      offset: "0",
    });
    if (search.trim()) params.set("q", search.trim());
    if (category !== "semua") params.set("category", category);

    const catalogRes = await fetch(`/api/catalog/search?${params}`);
    if (catalogRes.ok) {
      const json = (await catalogRes.json()) as { items?: Merchant[] };
      setMerchants(json.items ?? []);
    } else {
      const { data: merchantRows } = await supabase
        .from("merchants")
        .select("*")
        .eq("is_active", true)
        .eq("admin_suspended", false)
        .eq("approval_status", "approved");
      setMerchants(merchantRows ?? []);
    }

    const { data: menuPhotos } = await supabase
      .from("products")
      .select("merchant_id, image_url, updated_at")
      .eq("is_available", true)
      .not("image_url", "is", null)
      .order("updated_at", { ascending: false });

    setMenuCovers(buildMenuCoverMap(menuPhotos ?? []));
  }, [search, category]);

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

  const filtered = merchants;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          className="h-12 rounded-2xl border-slate-200 bg-white pl-11 text-base text-slate-900 shadow-sm placeholder:text-slate-500 focus-visible:ring-emerald-600/40"
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
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize transition ${
              category === c
                ? "bg-emerald-600 text-white shadow-md"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
                <p className="line-clamp-1 text-sm font-bold text-slate-900">{m.name}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
                  {open ? `${m.name} sedang buka` : `${m.name} tutup`}
                </p>
                {!open && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700">
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
                className="rounded-2xl border border-slate-200 bg-white py-2 text-center text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
              >
                Lihat menu
              </Link>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm font-semibold text-slate-600">Belum ada toko aktif</p>
      )}
    </div>
  );
}
