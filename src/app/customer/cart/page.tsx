"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import { ShoppingBag, ArrowRight } from "lucide-react";
import type { CartItem } from "@/types/database";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("wira_cart_")) {
        const mid = key.replace("wira_cart_", "");
        const cart = JSON.parse(localStorage.getItem(key) ?? "[]") as CartItem[];
        if (cart.length) {
          setMerchantId(mid);
          setItems(cart);
        }
      }
    }
  }, []);

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

      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <li
            key={i.product.id}
            className="glass-card flex items-center justify-between gap-3 p-4"
          >
            <div>
              <p className="font-medium text-white">{i.product.name}</p>
              <p className="text-xs text-muted-foreground">{i.quantity} × {formatIdr(i.product.price)}</p>
            </div>
            <p className="font-semibold text-cyan-300">{formatIdr(i.product.price * i.quantity)}</p>
          </li>
        ))}
      </ul>

      <div className="glass-card mt-6 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-bold text-white">{formatIdr(subtotal)}</span>
        </div>
        <Link href={`/customer/checkout?merchant=${merchantId}`} className="mt-4 block">
          <Button className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/25">
            Checkout
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </main>
  );
}
