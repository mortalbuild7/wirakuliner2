"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { ProductMenuImage } from "@/components/customer/product-menu-image";
import { Alert } from "@/components/ui/alert";
import { isStoreOpen } from "@/lib/merchant-open";
import { useSingleMerchantRealtime } from "@/hooks/use-merchant-realtime";
import type { CartItem, Product } from "@/types/database";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [dineIn, setDineIn] = useState(false);
  const [storeOpen, setStoreOpen] = useState(true);
  const [merchantName, setMerchantName] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("wira_cart_")) continue;
        const mid = key.replace("wira_cart_", "");
        const cart = JSON.parse(localStorage.getItem(key) ?? "[]") as CartItem[];
        if (!cart.length) continue;

        const ids = cart.map((c) => c.product.id);
        const { data: fresh } = await supabase
          .from("products")
          .select("*")
          .in("id", ids);

        const byId = new Map((fresh ?? []).map((p) => [p.id, p]));
        const merged = cart.map((c) => ({
          ...c,
          product: (byId.get(c.product.id) ?? c.product) as Product,
        }));

        localStorage.setItem(key, JSON.stringify(merged));
        setMerchantId(mid);
        setItems(merged);
        setDineIn(localStorage.getItem(`wira_dine_in_${mid}`) === "1");

        const { data: shop } = await supabase
          .from("merchants")
          .select("name, is_open")
          .eq("id", mid)
          .single();
        if (shop) {
          setMerchantName(shop.name);
          setStoreOpen(isStoreOpen(shop));
        }
        break;
      }
    }
    load();
  }, []);

  useSingleMerchantRealtime(merchantId ?? undefined, (m) => {
    setMerchantName(m.name);
    setStoreOpen(isStoreOpen(m));
  });

  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);

  if (!items.length) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-white">Keranjang kosong</p>
        <p className="mt-1 text-sm text-muted-foreground">Pilih menu favoritmu</p>
        <Link href="/customer" className="mt-6">
          <Button className="rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-8 text-slate-950">
            Jelajah toko
          </Button>
        </Link>
      </main>
    );
  }

  return (
    <main className="px-4 py-4">
      <h1 className="text-xl font-bold text-white">Keranjang</h1>
      <p className="text-sm text-muted-foreground">{items.length} item</p>

      {!storeOpen && (
        <Alert variant="warning" className="mt-3 border-amber-500/30 bg-amber-500/10">
          <strong>{merchantName || "Toko"} baru saja tutup</strong>
          <p className="mt-1 text-xs">Checkout dinonaktifkan. Status diperbarui otomatis.</p>
        </Alert>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <li
            key={i.product.id}
            className="glass-card flex items-center gap-3 p-3"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-800">
              <ProductMenuImage src={i.product.image_url} alt={i.product.name} sizes="56px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{i.product.name}</p>
              <p className="text-xs text-muted-foreground">
                {i.quantity} × {formatIdr(i.product.price)}
              </p>
            </div>
            <p className="shrink-0 font-semibold text-cyan-300">
              {formatIdr(i.product.price * i.quantity)}
            </p>
          </li>
        ))}
      </ul>

      <div className="glass-card mt-6 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-bold text-white">{formatIdr(subtotal)}</span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={
              storeOpen
                ? `/customer/checkout?merchant=${merchantId}${dineIn ? "&mode=dine_in" : ""}`
                : "#"
            }
            className={storeOpen ? "block" : "pointer-events-none block"}
            aria-disabled={!storeOpen}
          >
            <Button
              disabled={!storeOpen}
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 disabled:opacity-50"
            >
              {dineIn ? "Checkout di tempat" : "Checkout antar"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl border-white/15 text-sm"
            onClick={() => {
              if (!merchantId) return;
              const next = !dineIn;
              setDineIn(next);
              if (next) localStorage.setItem(`wira_dine_in_${merchantId}`, "1");
              else localStorage.removeItem(`wira_dine_in_${merchantId}`);
            }}
          >
            {dineIn ? "Ubah ke antar" : "Beli di tempat (tanpa ongkir)"}
          </Button>
        </div>
      </div>
    </main>
  );
}
