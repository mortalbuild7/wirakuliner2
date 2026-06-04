"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatIdr } from "@/lib/utils";
import type { Merchant, Product } from "@/types/database";
import { Trash2, Upload } from "lucide-react";

export default function MerchantProductsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const supabase = createClient();

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: m } = await supabase
      .from("merchants")
      .select("*")
      .eq("owner_id", user.id)
      .limit(1)
      .single();
    setMerchant(m);
    if (m) {
      const { data: p } = await supabase.from("products").select("*").eq("merchant_id", m.id);
      setProducts(p ?? []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant) return;
    await supabase.from("products").insert({
      merchant_id: merchant.id,
      name,
      price: Number(price),
      is_available: true,
    });
    setName("");
    setPrice("");
    load();
  }

  async function toggleAvailability(p: Product) {
    await supabase.from("products").update({ is_available: !p.is_available }).eq("id", p.id);
    load();
  }

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  async function uploadImage(productId: string, file: File) {
    const path = `${merchant?.id}/${productId}-${file.name}`;
    await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    await supabase.from("products").update({ image_url: data.publicUrl }).eq("id", productId);
    load();
  }

  return (
    <main className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">Produk & Menu</h1>
      <p className="text-sm text-muted-foreground">Kelola item yang tampil di customer app</p>
      <form onSubmit={addProduct} className="glass-card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1">
          <Label className="text-muted-foreground">Nama</Label>
          <Input className="mt-1 rounded-xl border-white/10 bg-white/5" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="w-full sm:w-32">
          <Label className="text-muted-foreground">Harga</Label>
          <Input className="mt-1 rounded-xl border-white/10 bg-white/5" type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <Button type="submit" className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white">
          Tambah
        </Button>
      </form>
      <div className="mt-6 space-y-3">
        {products.map((p) => (
          <Card key={p.id} className="glass-card border-0 bg-transparent shadow-none">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm">{formatIdr(Number(p.price))}</p>
                <p className="text-xs text-muted-foreground">
                  {p.is_available ? "Tersedia" : "Habis"}
                </p>
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(p.id, f);
                    }}
                  />
                </label>
                <Button variant="outline" size="sm" onClick={() => toggleAvailability(p)}>
                  Toggle
                </Button>
                <Button variant="destructive" size="icon" onClick={() => deleteProduct(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
