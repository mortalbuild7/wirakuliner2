"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createServiceCity,
  getRegenciesForServiceCityForm,
  type CreateCityInput,
  type WilayahRegencyOption,
} from "@/app/actions/cityActions";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import { Loader2, MapPin, Plus } from "lucide-react";

const SELECT_CLASS =
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

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
  const [provinceId, setProvinceId] = useState("");
  const [cityName, setCityName] = useState("");
  const [regencies, setRegencies] = useState<WilayahRegencyOption[]>([]);
  const [regenciesLoading, setRegenciesLoading] = useState(false);
  const [regenciesError, setRegenciesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchGenRef = useRef(0);

  const provinceSelected = provinceId !== "";

  const cityPlaceholder = !provinceSelected
    ? "— Pilih Provinsi Terlebih Dahulu —"
    : regenciesLoading
      ? "Memuat daftar kota..."
      : regenciesError
        ? "Gagal memuat daftar kota"
        : regencies.length === 0
          ? "Tidak ada kota tersedia"
          : "— Pilih Kota / Kabupaten —";

  const loadRegenciesForProvince = useCallback(async (pid: string) => {
    const id = Number(pid);
    if (!Number.isInteger(id) || id <= 0) {
      setRegencies([]);
      setRegenciesError(null);
      return;
    }

    const gen = ++fetchGenRef.current;
    setRegenciesLoading(true);
    setRegenciesError(null);

    const res = await getRegenciesForServiceCityForm(id);

    if (gen !== fetchGenRef.current) return;

    setRegenciesLoading(false);

    if (!res.ok) {
      setRegencies([]);
      setRegenciesError(res.error);
      return;
    }

    setRegencies(res.regencies);
  }, []);

  useEffect(() => {
    if (!provinceSelected) {
      setRegencies([]);
      setCityName("");
      setRegenciesError(null);
      setRegenciesLoading(false);
      return;
    }

    setCityName("");
    void loadRegenciesForProvince(provinceId);
  }, [provinceId, provinceSelected, loadRegenciesForProvince]);

  function handleProvinceChange(nextProvinceId: string) {
    setProvinceId(nextProvinceId);
    setCityName("");
    setRegenciesError(null);
    setError(null);
    setSuccess(null);
  }

  function provinceLabel(row: ServiceCityRow): string {
    const p = row.provinces;
    if (Array.isArray(p)) return p[0]?.name ?? "—";
    return p?.name ?? "—";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!provinceSelected) {
      setError("Pilih provinsi induk terlebih dahulu.");
      return;
    }

    if (!cityName.trim()) {
      setError("Pilih nama kota dari daftar.");
      return;
    }

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

  const canSubmit =
    provinceSelected &&
    cityName.trim().length >= 2 &&
    !regenciesLoading &&
    regencies.length > 0 &&
    !pending;

  return (
    <main className="p-6 text-slate-900">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <MapPin className="h-7 w-7 text-sky-600" aria-hidden />
          Manajemen Kota Layanan
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">
          Tambahkan kota layanan baru agar driver dan merchant dapat didaftarkan di
          wilayah tersebut. Hanya Super Admin yang dapat mengelola data ini.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 max-w-2xl text-slate-900">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mb-4 max-w-2xl border-emerald-600/40 bg-emerald-50 text-emerald-950">
          {success}
        </Alert>
      )}

      <Card className="max-w-2xl rounded-2xl border-sky-200 bg-white shadow-sm">
        <CardHeader className="rounded-t-2xl border-b border-slate-100 bg-slate-50/80">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Plus className="h-5 w-5 text-sky-600" aria-hidden />
            Tambah Kota Baru
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="province" className="text-slate-900">
                Provinsi Induk
              </Label>
              <p className="mt-0.5 text-xs text-slate-600">
                {provinces.length} provinsi Indonesia — data master dinamis.
              </p>
              <select
                id="province"
                className={SELECT_CLASS}
                value={provinceId}
                onChange={(e) => handleProvinceChange(e.target.value)}
                required
                disabled={pending}
              >
                <option value="">— Pilih Provinsi Induk —</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="city-name" className="text-slate-900">
                Nama Kota Baru
              </Label>
              <p className="mt-0.5 text-xs text-slate-600">
                Daftar kabupaten/kota diambil otomatis dari API wilayah Indonesia.
              </p>
              <select
                id="city-name"
                className={SELECT_CLASS}
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                disabled={
                  pending || !provinceSelected || regenciesLoading || regencies.length === 0
                }
                required
              >
                <option value="">{cityPlaceholder}</option>
                {regencies.map((r) => (
                  <option key={r.kemendagriId} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              {regenciesLoading && provinceSelected && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" aria-hidden />
                  Memuat daftar kota...
                </p>
              )}
              {regenciesError && !regenciesLoading && provinceSelected && (
                <p className="mt-1.5 text-xs font-medium text-amber-800">
                  {regenciesError}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={!canSubmit}
                className="gap-2 rounded-2xl bg-sky-600 text-white hover:bg-sky-700"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                Tambah Kota
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Daftar Kota Layanan Aktif ({cities.length})
        </h2>
        {cities.length === 0 ? (
          <p className="mt-4 text-sm text-slate-700">
            Belum ada kota layanan. Tambahkan kota pertama menggunakan form di atas.
          </p>
        ) : (
          <div className="wira-table-wrap mt-4 min-w-[640px] rounded-2xl border border-slate-200">
            <table>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-slate-900">Nama Zona</th>
                  <th className="px-4 py-3 text-slate-900">Provinsi</th>
                  <th className="px-4 py-3 text-slate-900">Kode Kota</th>
                  <th className="px-4 py-3 text-slate-900">Radius</th>
                  <th className="px-4 py-3 text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-700">{provinceLabel(c)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      P{c.province_id ?? "—"} / K{c.city_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{c.radius_km} km</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          c.is_active
                            ? "font-medium text-emerald-700"
                            : "font-medium text-red-700"
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
