"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import type { Merchant, Product } from "@/types/database";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.from("merchants").select("*").eq("id", id).single().then(({ data }) => setMerchant(data));
    supabase
      .from("products")
      .select("*")
      .eq("merchant_id", id)
      .eq("is_available", true)
      .then(({ data }) => setProducts(data ?? []));
  }, [id]);

  function addToCart(product: Product) {
    const key = `wira_cart_${id}`;
    const raw = localStorage.getItem(key);
    const cart: { product: Product; quantity: number }[] = raw ? JSON.parse(raw) : [];
    const existing = cart.find((c) => c.product.id === product.id);
    if (existing) existing.quantity += 1;
    else cart.push({ product, quantity: 1 });
    localStorage.setItem(key, JSON.stringify(cart));
    router.push("/customer/cart");
  }

  if (!merchant) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center p-4">
        <p className="animate-pulse text-cyan-300/80">Memuat menu...</p>
      </main>
    );
  }

  return (
    <main className="px-4 py-4">
      <Link
        href="/customer"
        className="mb-4 inline-flex items-center gap-1 text-sm text-cyan-400"
      >
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>

      <header className="glass-card mb-6 p-4">
        <h1 className="text-2xl font-bold text-white">{merchant.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{merchant.description || merchant.address}</p>
        <span className="mt-2 inline-block rounded-full bg-orange-500/20 px-3 py-0.5 text-xs text-orange-300">
          {merchant.category ?? "umum"}
        </span>
      </header>

      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Menu</p>
      <div className="space-y-3">
        {products.map((p) => (
          <article
            key={p.id}
            className="glass-card flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-lg font-bold text-cyan-300">{formatIdr(Number(p.price))}</p>
            </div>
            <Button
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/30"
              onClick={() => addToCart(p)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </article>
        ))}
        {products.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Menu belum tersedia</p>
        )}
      </div>
    </main>
  );
}
