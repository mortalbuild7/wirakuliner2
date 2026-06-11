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
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import { Loader2, MapPin, Plus } from "lucide-react";

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
  /** 38 provinsi dari `INDONESIA_PROVINCES` — di-map ke `<option>` dropdown. */
  provinces: IndonesiaProvince[];
  initialCities: ServiceCityRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [cities, setCities] = useState(initialCities);
  const [provinceId, setProvinceId] = useState(String(provinces[0]?.id ?? 1));
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
    <main className="p-6 text-slate-800">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <MapPin className="h-7 w-7 text-sky-600" />
          Manajemen Kota Layanan
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
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
            <div className="sm:col-span-2">
              <Label htmlFor="province">Provinsi Induk</Label>
              <p className="mt-0.5 text-xs text-slate-500">
                {provinces.length} provinsi Indonesia — data master dinamis.
              </p>
              {/* Render 38 provinsi via .map() — tanpa hardcode per baris */}
              <select
                id="province"
                className="mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]"
                value={provinceId}
                onChange={(e) => setProvinceId(e.target.value)}
                required
                disabled={pending}
              >
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id}. {p.name}
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
              <Button type="submit" disabled={pending} className="gap-2">
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Tambah Kota
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800">
          Daftar Kota Layanan Aktif ({cities.length})
        </h2>
        {cities.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Belum ada kota layanan. Tambahkan kota pertama menggunakan form di atas.
          </p>
        ) : (
          <div className="wira-table-wrap mt-4 min-w-[640px]">
            <table>
              <thead>
                <tr>
                  <th className="px-4 py-3">Nama Zona</th>
                  <th className="px-4 py-3">Provinsi</th>
                  <th className="px-4 py-3">Kode Kota</th>
                  <th className="px-4 py-3">Radius</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {provinceLabel(c)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
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
