"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIdr } from "@/lib/utils";
import { MenuImageUpload } from "@/components/merchant/menu-image-upload";
import { optimizeMenuImage, formatBytes } from "@/lib/optimize-menu-image";
import type { Merchant, Product } from "@/types/database";
import { Trash2, Plus, Loader2, ImagePlus } from "lucide-react";

export default function MerchantProductsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const newImageRef = useRef<HTMLInputElement>(null);
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
      const { data: p } = await supabase
        .from("products")
        .select("*")
        .eq("merchant_id", m.id)
        .order("created_at", { ascending: false });
      setProducts(p ?? []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadForProduct(productId: string, file: File) {
    const optimized = await optimizeMenuImage(file);
    const body = new FormData();
    body.append("productId", productId);
    body.append("file", optimized.blob, `menu.${optimized.ext}`);
    body.append("ext", optimized.ext);
    const res = await fetch("/api/merchant/products/image", { method: "POST", body });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload gagal");
    return json.imageUrl as string;
  }

  function onPickNewImage(file: File | undefined) {
    if (!file) return;
    setPendingImage(file);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant) return;
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from("products")
        .insert({
          merchant_id: merchant.id,
          name: name.trim(),
          price: Number(price),
          is_available: true,
        })
        .select("id")
        .single();

      if (error || !created) {
        alert(error?.message ?? "Gagal menambah produk");
        return;
      }

      if (pendingImage) {
        await uploadForProduct(created.id, pendingImage);
      }

      setName("");
      setPrice("");
      setPendingImage(null);
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingPreview(null);
      if (newImageRef.current) newImageRef.current.value = "";
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(p: Product) {
    await supabase.from("products").update({ is_available: !p.is_available }).eq("id", p.id);
    load();
  }

  async function deleteProduct(id: string) {
    if (!confirm("Hapus produk ini?")) return;
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  function refreshProductImage(productId: string, imageUrl: string) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, image_url: imageUrl } : p))
    );
  }

  return (
    <main className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">Produk & Menu</h1>
      <p className="text-sm text-muted-foreground">
        Tambah foto menu — otomatis dikompres (WebP, max 960px) agar ringan di app customer
      </p>

      <form
        onSubmit={addProduct}
        className="glass-card mt-4 space-y-4 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-orange-300/90">
          Produk baru
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <button
            type="button"
            onClick={() => newImageRef.current?.click()}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 hover:border-orange-500/40"
          >
            {pendingPreview ? (
              <Image src={pendingPreview} alt="Preview" fill className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImagePlus className="h-6 w-6" />
                <span className="text-[10px]">Foto</span>
              </span>
            )}
          </button>
          <input
            ref={newImageRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            onChange={(e) => onPickNewImage(e.target.files?.[0])}
          />
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[140px] flex-1">
              <Label className="text-muted-foreground">Nama menu</Label>
              <Input
                className="mt-1 rounded-xl border-white/10 bg-white/5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="w-full sm:w-36">
              <Label className="text-muted-foreground">Harga (Rp)</Label>
              <Input
                className="mt-1 rounded-xl border-white/10 bg-white/5"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah menu
                </>
              )}
            </Button>
          </div>
        </div>
        {pendingImage && (
          <p className="text-[10px] text-muted-foreground">
            Foto akan dioptimasi saat disimpan ({formatBytes(pendingImage.size)} asli)
          </p>
        )}
      </form>

      <div className="mt-6 space-y-3">
        {products.map((p) => (
          <article
            key={p.id}
            className="glass-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
          >
            <MenuImageUpload
              productId={p.id}
              currentUrl={p.image_url}
              onUploaded={(url) => refreshProductImage(p.id, url)}
              compact
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-lg font-bold text-orange-300">{formatIdr(Number(p.price))}</p>
              <p className="text-xs text-muted-foreground">
                {p.is_available ? "Tersedia di customer app" : "Disembunyikan (habis)"}
              </p>
              {!p.image_url && (
                <p className="mt-1 text-[10px] text-amber-400/90">Belum ada foto — tap kotak untuk upload</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-white/15"
                onClick={() => toggleAvailability(p)}
              >
                {p.is_available ? "Sembunyikan" : "Tampilkan"}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="rounded-xl"
                onClick={() => deleteProduct(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </article>
        ))}
        {products.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada menu. Tambahkan produk di atas.
          </p>
        )}
      </div>
    </main>
  );
}
