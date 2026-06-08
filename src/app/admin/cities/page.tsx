"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { MapPin, Loader2 } from "lucide-react";
import { JALAN_WIRA } from "@/lib/geo-config";

type CityRow = {
  id: string;
  name: string;
  slug: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
};

const EMPTY = {
  name: "",
  slug: "",
  center_lat: String(JALAN_WIRA.latitude),
  center_lng: String(JALAN_WIRA.longitude),
  radius_km: "12",
};

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    const res = await fetch("/api/admin/cities", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as {
      cities?: CityRow[];
      error?: string;
    };
    if (!res.ok) setError(json.error ?? "Gagal memuat kota");
    else setCities(json.cities ?? []);
    setListLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCity(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        center_lat: Number(form.center_lat),
        center_lng: Number(form.center_lng),
        radius_km: Number(form.radius_km),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Gagal menambah kota");
      return;
    }
    setSuccess(`Kota ${form.name} ditambahkan`);
    setForm(EMPTY);
    void load();
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapPin className="h-7 w-7 text-sky-600" />
          Kota Layanan
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Tentukan wilayah layanan driver. Customer di luar radius kota atau tanpa driver
          terdaftar akan melihat pesan layanan belum tersedia.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 max-w-2xl">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mb-4 max-w-2xl border-emerald-500/40 bg-emerald-500/10 text-emerald-900">
          {success}
        </Alert>
      )}

      <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Tambah kota</h2>
        <form onSubmit={addCity} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="city-name">Nama kota</Label>
            <Input
              id="city-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Parung, Bogor"
              required
            />
          </div>
          <div>
            <Label htmlFor="city-slug">Slug (opsional)</Label>
            <Input
              id="city-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="parung-bogor"
            />
          </div>
          <div>
            <Label htmlFor="city-radius">Radius (km)</Label>
            <Input
              id="city-radius"
              type="number"
              min={1}
              max={100}
              value={form.radius_km}
              onChange={(e) => setForm({ ...form, radius_km: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="city-lat">Latitude pusat</Label>
            <Input
              id="city-lat"
              value={form.center_lat}
              onChange={(e) => setForm({ ...form, center_lat: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="city-lng">Longitude pusat</Label>
            <Input
              id="city-lng"
              value={form.center_lng}
              onChange={(e) => setForm({ ...form, center_lng: e.target.value })}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan kota"
              )}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Daftar kota ({cities.length})</h2>
        {listLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Memuat...</p>
        ) : cities.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Belum ada kota.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {cities.map((c) => (
              <li key={c.id} className="rounded-lg border bg-card p-4 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground">
                  Radius {c.radius_km} km · Pusat {c.center_lat}, {c.center_lng}
                </p>
                <p className="text-xs text-muted-foreground">
                  Slug: {c.slug} · {c.is_active ? "Aktif" : "Nonaktif"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
