"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Zap, ChevronRight } from "lucide-react";
import type { Merchant } from "@/types/database";

const CATEGORIES = ["semua", "makanan", "minuman", "snack", "umum"];

export default function CustomerHomePage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("semua");
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("merchants")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => setMerchants(data ?? []));
  }, []);

  const filtered = merchants.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "semua" || m.category === category;
    return matchSearch && matchCat;
  });

  return (
    <main className="px-4 py-4">
      <section className="glass-card mb-5 overflow-hidden p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-cyan-400">
              <Zap className="h-3.5 w-3.5" /> Antar cepat
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-white">
              Makanan
              <br />
              <span className="bg-gradient-to-r from-cyan-300 to-orange-400 bg-clip-text text-transparent">
                dalam 3 km
              </span>
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Ongkir flat Rp 12.000 · luar radius nego driver
            </p>
          </div>
        </div>
      </section>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400/70" />
        <Input
          className="h-12 rounded-2xl border-white/10 bg-white/5 pl-11 text-base placeholder:text-muted-foreground focus-visible:ring-cyan-500/50"
          placeholder="Cari restoran..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        {filtered.map((m) => (
          <Link key={m.id} href={`/customer/merchant/${m.id}`} className="group">
            <article className="glass-card overflow-hidden transition active:scale-[0.98]">
              <div className="relative aspect-[4/3] bg-slate-800">
                {m.image_url ? (
                  <Image src={m.image_url} alt={m.name} fill className="object-cover" sizes="50vw" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-4xl">
                    🍽️
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <Badge className="absolute left-2 top-2 border-0 bg-black/50 text-[10px] backdrop-blur">
                  {m.category ?? "umum"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <p className="line-clamp-1 text-sm font-semibold text-white">{m.name}</p>
                <ChevronRight className="h-4 w-4 shrink-0 text-cyan-400 opacity-0 transition group-hover:opacity-100" />
              </div>
            </article>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada toko aktif</p>
      )}
    </main>
  );
}
