"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableCitySelect } from "@/components/ui/searchable-city-select";
import { getCitiesByProvinceId } from "@/lib/indonesia-regions";
import {
  createServiceCity,
  type CreateCityInput,
} from "@/app/actions/cityActions";
import {
  ServiceCitiesTable,
  type ServiceCityTableRow,
} from "@/components/admin/service-cities-table";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import { Loader2, MapPin, Plus } from "lucide-react";

const SELECT_CLASS =
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

type ServiceCityRow = ServiceCityTableRow;

export function CityManagementForm({
  provinces,
  initialCities,
}: {
  provinces: IndonesiaProvince[];
  initialCities: ServiceCityRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [cities, setCities] = useState(initialCities);
  const [provinceId, setProvinceId] = useState("");
  const [cityName, setCityName] = useState("");

  const provinceSelected = provinceId !== "";
  const provinceIdNum = Number(provinceId);

  const regencies = useMemo(() => {
    if (!Number.isInteger(provinceIdNum) || provinceIdNum <= 0) return [];
    return getCitiesByProvinceId(provinceIdNum);
  }, [provinceIdNum]);

  function handleProvinceChange(nextProvinceId: string) {
    setProvinceId(nextProvinceId);
    setCityName("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!provinceSelected) {
      toast.error("Pilih provinsi induk terlebih dahulu.");
      return;
    }

    if (!cityName.trim()) {
      toast.error("Pilih nama kota dari daftar.");
      return;
    }

    if (!regencies.includes(cityName)) {
      toast.error("Kota yang dipilih tidak sesuai dengan provinsi induk.");
      return;
    }

    const payload: CreateCityInput = {
      provinceId: Number(provinceId),
      cityName: cityName.trim(),
    };

    startTransition(async () => {
      const res = await createServiceCity(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(res.message);
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
          Tambahkan atau hapus kota layanan agar driver dan merchant dapat didaftarkan di
          wilayah tersebut. Hanya Super Admin yang dapat mengelola data ini.
        </p>
      </div>

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
                {provinces.length} provinsi Indonesia — data master lokal.
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
                Ketik untuk mencari — sumber data master lokal (tanpa API eksternal).
              </p>
              <SearchableCitySelect
                id="city-name"
                key={`mgmt-city-${provinceId}`}
                cities={regencies}
                value={cityName}
                onChange={setCityName}
                disabled={pending || !provinceSelected}
                placeholder="— Pilih Provinsi Terlebih Dahulu —"
                emptyMessage="Tidak ada kota untuk provinsi ini"
                required
              />
              {provinceSelected && (
                <p className="mt-1.5 text-xs font-medium text-slate-600">
                  {regencies.length} kota/kabupaten tersedia.
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
        <ServiceCitiesTable cities={cities} onCitiesChange={setCities} />
      </section>
    </main>
  );
}
