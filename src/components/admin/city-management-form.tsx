"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createServiceCity,
  type CreateCityInput,
} from "@/app/actions/cityActions";
import { Loader2, MapPin, Plus } from "lucide-react";

/** Baris provinsi induk dari tabel `provinces` — dipakai dropdown form. */
type Province = { id: number; name: string };

/** Baris zona layanan dari tabel `service_cities` — ditampilkan di tabel bawah. */
type ServiceCityRow = {
  id: string;
  name: string;
  slug: string;
  province_id: number | null;
  city_id: number | null;
  radius_km: number;
  is_active: boolean;
  provinces?: { name: string } | { name: string }[] | null;
};

export function CityManagementForm({
  provinces,
  initialCities,
}: {
  provinces: Province[];
  initialCities: ServiceCityRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [cities, setCities] = useState(initialCities);
  const [provinceId, setProvinceId] = useState(
    provinces[0] ? String(provinces[0].id) : ""
  );
  const [cityName, setCityName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function provinceLabel(row: ServiceCityRow): string {
    const p = row.provinces;
    if (Array.isArray(p)) return p[0]?.name ?? "—";
    return p?.name ?? "—";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: CreateCityInput = {
      provinceId: Number(provinceId),
      cityName: cityName.trim(),
    };

    startTransition(async () => {
      const res = await createServiceCity(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(res.message);
      setCityName("");
      // Optimistic append — data baru langsung tampil tanpa reload penuh.
      const prov = provinces.find((p) => p.id === payload.provinceId);
      setCities((prev) => [
        {
          id: res.serviceCityId,
          name: `${payload.cityName}, ${prov?.name ?? ""}`,
          slug: "",
          province_id: payload.provinceId,
          city_id: res.cityId,
          radius_km: 12,
          is_active: true,
          provinces: prov ? { name: prov.name } : null,
        },
        ...prev,
      ]);
    });
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapPin className="h-7 w-7 text-sky-600" />
          Manajemen Kota Layanan
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Tambahkan kota layanan baru agar driver dan merchant dapat didaftarkan di
          wilayah tersebut. Hanya Super Admin yang dapat mengelola data ini.
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

      <Card className="max-w-2xl border-sky-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-sky-600" />
            Tambah Kota Baru
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="province">Provinsi Induk</Label>
              {/* provinceId → foreign key ke tabel `provinces.id` */}
              <select
                id="province"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={provinceId}
                onChange={(e) => setProvinceId(e.target.value)}
                required
                disabled={pending || provinces.length === 0}
              >
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="city-name">Nama Kota Baru</Label>
              {/* cityName → disimpan ke `cities.name` + label `service_cities.name` */}
              <Input
                id="city-name"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Contoh: Parung"
                required
                minLength={2}
                maxLength={120}
                disabled={pending}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={pending || provinces.length === 0}
                className="gap-2"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Tambah Kota
              </Button>
            </div>
          </form>
          {provinces.length === 0 && (
            <p className="mt-3 text-xs text-red-600">
              Tabel provinsi kosong — jalankan migrasi regional admin terlebih dahulu.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Daftar Kota Layanan Aktif ({cities.length})
        </h2>
        {cities.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Belum ada kota layanan. Tambahkan kota pertama menggunakan form di atas.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-3">Nama Zona</th>
                  <th className="px-4 py-3">Provinsi</th>
                  <th className="px-4 py-3">Kode Kota</th>
                  <th className="px-4 py-3">Radius</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {provinceLabel(c)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      P{c.province_id ?? "—"} / K{c.city_id ?? "—"}
                    </td>
                    <td className="px-4 py-3">{c.radius_km} km</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          c.is_active
                            ? "text-emerald-600"
                            : "text-red-600"
                        }
                      >
                        {c.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
