"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatIdr, cn } from "@/lib/utils";
import { ProductMenuImage } from "@/components/customer/product-menu-image";
import { StoreStatusBadge } from "@/components/customer/store-status-badge";
import { isStoreOpen } from "@/lib/merchant-open";
import type { Merchant, Product } from "@/types/database";
import { Plus, ArrowLeft, Store, Lock } from "lucide-react";
import Link from "next/link";
import { useSingleMerchantRealtime } from "@/hooks/use-merchant-realtime";

function MerchantDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const viewOnlyParam = searchParams.get("view") === "1";
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const router = useRouter();
  const supabase = createClient();

  async function loadMerchant() {
    const { data } = await supabase.from("merchants").select("*").eq("id", id).single();
    setMerchant(data);
    return data;
  }

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("merchant_id", id)
      .eq("is_available", true)
      .order("name");
    setProducts(data ?? []);
  }

  useEffect(() => {
    loadMerchant();
    loadProducts();
  }, [id]);

  useSingleMerchantRealtime(id, (row) => setMerchant(row));

  const canOrder = merchant ? isStoreOpen(merchant) : false;
  const viewOnly = viewOnlyParam || !canOrder;

  function addToCart(product: Product) {
    if (viewOnly || !canOrder) return;
    const key = `wira_cart_${id}`;
    const raw = localStorage.getItem(key);
    const cart: { product: Product; quantity: number }[] = raw ? JSON.parse(raw) : [];
    const existing = cart.find((c) => c.product.id === product.id);
    if (existing) existing.quantity += 1;
    else cart.push({ product, quantity: 1 });
    localStorage.setItem(key, JSON.stringify(cart));
    localStorage.removeItem(`wira_dine_in_${id}`);
    router.push("/customer/cart");
  }

  if (!merchant) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center p-4">
        <p className="animate-pulse text-cyan-300/80">Memuat etalase...</p>
      </main>
    );
  }

  const heroImage =
    merchant.image_url ?? products.find((p) => p.image_url)?.image_url ?? null;

  return (
    <main className="px-4 py-4">
      <Link
        href="/customer"
        className="mb-4 inline-flex items-center gap-1 text-sm text-cyan-400"
      >
        <ArrowLeft className="h-4 w-4" /> Etalase
      </Link>

      {!canOrder && (
        <Alert variant="warning" className="mb-4 border-amber-500/30 bg-amber-500/10">
          <strong className="flex items-center gap-2 text-amber-200">
            <Lock className="h-4 w-4" />
            {merchant.name} tutup
          </strong>
          <p className="mt-1 text-xs text-muted-foreground">
            Menu hanya bisa dilihat. Pesanan dibuka saat merchant menekan &quot;Buka toko&quot;.
          </p>
        </Alert>
      )}

      {canOrder && (
        <p className="mb-3 text-sm text-emerald-300/90">
          {merchant.name} sedang buka — silakan pesan
        </p>
      )}

      <header className="glass-card mb-6 overflow-hidden p-0">
        <div className="relative aspect-[2/1] w-full bg-slate-800">
          <ProductMenuImage src={heroImage} alt={merchant.name} sizes="100vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          <div className="absolute left-3 top-3">
            <StoreStatusBadge merchant={merchant} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h1 className="text-2xl font-bold text-white">{merchant.name}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-slate-200">
              {merchant.description || merchant.address}
            </p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <span className="inline-block rounded-full bg-orange-500/20 px-3 py-0.5 text-xs text-orange-300">
            {merchant.category ?? "umum"}
          </span>
          {canOrder && (
            <Button
              variant="outline"
              className="h-11 w-full rounded-2xl border-cyan-500/40 text-cyan-200"
              onClick={() => {
                localStorage.setItem(`wira_dine_in_${id}`, "1");
                router.push("/customer/cart");
              }}
            >
              <Store className="mr-2 h-4 w-4" />
              Mode beli di tempat
            </Button>
          )}
        </div>
      </header>

      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {viewOnly ? "Menu (lihat saja)" : "Menu etalase"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {products.map((p) => (
          <article
            key={p.id}
            className={cn(
              "glass-card overflow-hidden",
              viewOnly && "pointer-events-none opacity-90"
            )}
          >
            <div className="relative aspect-square bg-slate-800">
              <ProductMenuImage src={p.image_url} alt={p.name} sizes="45vw" />
              {viewOnly && (
                <div className="absolute inset-0 bg-slate-950/30" />
              )}
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-medium text-white">{p.name}</p>
              <p className="mt-1 text-base font-bold text-cyan-300">
                {formatIdr(Number(p.price))}
              </p>
              {canOrder ? (
                <Button
                  size="sm"
                  className="pointer-events-auto mt-2 h-9 w-full rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-slate-950"
                  onClick={() => addToCart(p)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Tambah
                </Button>
              ) : (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">Tidak tersedia</p>
              )}
            </div>
          </article>
        ))}
      </div>
      {products.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Menu belum tersedia</p>
      )}
    </main>
  );
}

export default function MerchantDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[40vh] items-center justify-center p-4">
          <p className="animate-pulse text-cyan-300/80">Memuat etalase...</p>
        </main>
      }
    >
      <MerchantDetailContent />
    </Suspense>
  );
}
