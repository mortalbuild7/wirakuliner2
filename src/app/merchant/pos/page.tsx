"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatIdr } from "@/lib/utils";
import { ThermalReceipt } from "@/components/merchant/thermal-receipt";
import {
  calcChange,
  orderTotalAmount,
  parseCashPaidInput,
  type PosCashPayment,
} from "@/lib/pos-cash";
import type { Order, OrderItem, Product } from "@/types/database";
import { printThermalReceipt } from "@/lib/print";
import { Minus, Plus, Printer, ShoppingCart, Wallet } from "lucide-react";

type CartLine = { product: Product; quantity: number };

export default function MerchantPosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [guestName, setGuestName] = useState("");
  const [activeOrder, setActiveOrder] = useState<(Order & { order_items?: OrderItem[] }) | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [cashPaidInput, setCashPaidInput] = useState("");
  const [receiptCash, setReceiptCash] = useState<PosCashPayment | null>(null);
  const supabase = createClient();

  const orderTotal = activeOrder
    ? orderTotalAmount(
        Number(activeOrder.total_product_amount),
        Number(activeOrder.delivery_fee)
      )
    : 0;
  const cashPaid = parseCashPaidInput(cashPaidInput);
  const kembalian = calcChange(orderTotal, cashPaid);
  const cashEnough = cashPaid >= orderTotal && orderTotal > 0;

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase
        .from("merchants")
        .select("id, name")
        .eq("owner_id", user.id)
        .single();
      if (!m) return;
      setMerchantName(m.name);
      const { data: prods } = await supabase
        .from("products")
        .select("*")
        .eq("merchant_id", m.id)
        .eq("is_available", true)
        .order("name");
      setProducts(prods ?? []);
    };
    load();
  }, []);

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === p.id);
      if (ex) {
        return prev.map((c) =>
          c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product.id === productId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  const subtotal = cart.reduce((s, c) => s + Number(c.product.price) * c.quantity, 0);

  async function createOrder() {
    if (!cart.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/pos/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
            price: Number(c.product.price),
            name: c.product.name,
          })),
          customerDisplayName: guestName,
          startPreparing: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Gagal membuat pesanan");
        return;
      }
      setActiveOrder(json.order);
      setCart([]);
      setGuestName("");
      setCashPaidInput("");
      setReceiptCash(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmPayment(nonCash = false) {
    if (!activeOrder) return;
    if (!nonCash && !cashEnough) {
      alert(`Uang kurang. Total ${formatIdr(orderTotal)}, masukkan minimal senilai total.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/pos/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: activeOrder.id,
          ...(nonCash ? {} : { cashPaid }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Gagal konfirmasi bayar");
        return;
      }
      if (!nonCash) {
        setReceiptCash({ cashPaid, change: kembalian, total: orderTotal });
      } else {
        setReceiptCash(null);
      }
      setActiveOrder(json.order);
      setShowReceipt(true);
    } finally {
      setLoading(false);
    }
  }

  function setExactCash() {
    setCashPaidInput(String(orderTotal));
  }

  function addCashAmount(amount: number) {
    setCashPaidInput(String(cashPaid + amount));
  }

  async function finishOrder() {
    if (!activeOrder) return;
    await supabase.from("orders").update({ order_status: "delivered" }).eq("id", activeOrder.id);
    setActiveOrder(null);
    setShowReceipt(false);
    setCashPaidInput("");
    setReceiptCash(null);
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white md:text-2xl">Kasir On-The-Spot</h1>
          <p className="text-sm text-muted-foreground">
            Walk-in: siapkan → bayar → cetak struk
          </p>
        </div>
        <Badge className="bg-orange-500/20 text-orange-300">POS</Badge>
      </div>

      {!activeOrder ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Menu cepat
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="glass-card p-3 text-left transition active:scale-[0.98] hover:border-orange-500/40"
                >
                  <p className="line-clamp-2 text-sm font-medium text-white">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-orange-300">
                    {formatIdr(Number(p.price))}
                  </p>
                </button>
              ))}
              {products.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  Tambah produk di menu terlebih dahulu
                </p>
              )}
            </div>
          </section>

          <section className="glass-card space-y-4 p-4">
            <div className="flex items-center gap-2 text-white">
              <ShoppingCart className="h-5 w-5 text-orange-400" />
              <span className="font-semibold">Keranjang</span>
            </div>

            <div>
              <Label className="text-muted-foreground">Nama pembeli (opsional)</Label>
              <Input
                className="mt-1.5 rounded-xl border-white/10 bg-white/5"
                placeholder="Mis. Budi"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>

            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {cart.map((c) => (
                <li key={c.product.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 text-white">{c.product.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => changeQty(c.product.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center">{c.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => changeQty(c.product.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="w-20 text-right text-orange-300">
                    {formatIdr(Number(c.product.price) * c.quantity)}
                  </span>
                </li>
              ))}
              {!cart.length && (
                <p className="text-center text-sm text-muted-foreground">Belum ada item</p>
              )}
            </ul>

            <div className="flex justify-between border-t border-white/10 pt-3 font-bold text-white">
              <span>Total</span>
              <span className="text-orange-300">{formatIdr(subtotal)}</span>
            </div>

            <Button
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 font-semibold text-slate-950"
              disabled={!cart.length || loading}
              onClick={createOrder}
            >
              Buat pesanan & siapkan
            </Button>
          </section>
        </div>
      ) : (
        <section className="glass-card max-w-lg space-y-4 p-5">
          <p className="font-mono text-sm text-cyan-300">#{activeOrder.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-sm">{activeOrder.delivery_address}</p>
          <p className="text-sm text-muted-foreground">Total tagihan</p>
          <p className="text-2xl font-bold text-white">{formatIdr(orderTotal)}</p>
          <Badge>{activeOrder.order_status}</Badge>

          <div className="flex flex-col gap-2">
            {activeOrder.order_status === "preparing" && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <Label className="text-muted-foreground">Uang diterima (tunai)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="mt-1.5 rounded-xl border-white/10 bg-white/5 text-lg font-semibold text-white"
                    placeholder="Contoh: 50000"
                    value={cashPaidInput}
                    onChange={(e) => setCashPaidInput(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={setExactCash}>
                    Pas
                  </Button>
                  {[10000, 20000, 50000, 100000].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-xs"
                      onClick={() => addCashAmount(n)}
                    >
                      +{n / 1000}rb
                    </Button>
                  ))}
                </div>
                {cashPaid > 0 && (
                  <div className="rounded-lg bg-emerald-500/15 p-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Bayar</span>
                      <span>{formatIdr(cashPaid)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-lg font-bold text-emerald-300">
                      <span>Kembalian</span>
                      <span>{cashEnough ? formatIdr(kembalian) : "—"}</span>
                    </div>
                    {!cashEnough && (
                      <p className="mt-1 text-xs text-amber-400">Kurang {formatIdr(orderTotal - cashPaid)}</p>
                    )}
                  </div>
                )}
                <Button
                  className="h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-600 font-semibold text-slate-950"
                  disabled={loading || !cashEnough}
                  onClick={() => confirmPayment(false)}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Bayar & cetak struk
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  disabled={loading}
                  onClick={() => confirmPayment(true)}
                >
                  QR / transfer (tanpa kembalian di struk)
                </Button>
              </div>
            )}
            {activeOrder.order_status === "paid" && (
              <>
                <Button
                  variant="outline"
                  className="h-12 rounded-2xl border-orange-500/40"
                  onClick={() => setShowReceipt(true)}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak struk
                </Button>
                <Button className="rounded-2xl" onClick={finishOrder}>
                  Selesai — pesanan selesai
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => { setActiveOrder(null); setShowReceipt(false); setCashPaidInput(""); setReceiptCash(null); }}>
              Pesanan baru
            </Button>
          </div>
        </section>
      )}

      {showReceipt && activeOrder?.order_items && (
        <div className="thermal-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] overflow-auto rounded-lg bg-white print:overflow-visible print:rounded-none print:shadow-none">
            <ThermalReceipt
              order={activeOrder}
              items={activeOrder.order_items}
              merchantName={merchantName}
              cashPayment={receiptCash}
            />
            <div className="flex gap-2 p-4 print:hidden">
              <Button onClick={() => printThermalReceipt()}>Cetak struk thermal</Button>
              <Button variant="outline" onClick={() => setShowReceipt(false)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
