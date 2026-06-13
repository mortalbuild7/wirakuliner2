"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableCitySelect } from "@/components/ui/searchable-city-select";
import {
  DriverPhotoPicker,
  uploadDriverPhoto,
  type DriverPhotoDraft,
} from "@/components/admin/driver-photo-picker";
import { SimDocumentUploader } from "@/components/admin/sim-document-uploader";
import {
  registerDriverNational,
  type DriverRegInput,
} from "@/app/actions/driverRegActions";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import { filterCitiesForAdminScope } from "@/lib/indonesia-regions";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bike,
  Car,
  IdCard,
  Loader2,
  Lock,
  Truck,
  UserPlus,
} from "lucide-react";

type ServiceCategory = "MOTOR_HYBRID" | "MOBIL_PASSENGER" | "MOBIL_CARGO";

const SELECT_CLASS =
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-900 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60";

const FLEET_OPTIONS: {
  value: ServiceCategory;
  label: string;
  desc: string;
  icon: typeof Bike;
  accent: string;
}[] = [
  {
    value: "MOTOR_HYBRID",
    label: "Motor Hybrid",
    desc: "NGOJEK penumpang + PAKET kecil (≤ 60.000 cm³)",
    icon: Bike,
    accent: "border-cyan-500 bg-cyan-50 text-cyan-700",
  },
  {
    value: "MOBIL_PASSENGER",
    label: "Mobil Penumpang",
    desc: "NGOMOBIL — antar penumpang dengan mobil pribadi",
    icon: Car,
    accent: "border-sky-500 bg-sky-50 text-sky-700",
  },
  {
    value: "MOBIL_CARGO",
    label: "Mobil Cargo",
    desc: "PAKET kubikasi besar — mobil box / pickup",
    icon: Truck,
    accent: "border-amber-500 bg-amber-50 text-amber-700",
  },
];

export function DriverRegistrationForm({
  provinces,
  defaultProvinceId,
  adminTier,
  scopeHint,
  regionLocked,
  lockedCityName,
}: {
  provinces: IndonesiaProvince[];
  defaultProvinceId: number;
  adminTier: string;
  scopeHint: string;
  regionLocked: boolean;
  lockedCityName?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [serviceCategory, setServiceCategory] =
    useState<ServiceCategory>("MOTOR_HYBRID");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    vehiclePlate: "",
    provinceId: String(defaultProvinceId),
    cityName: "",
    simNumber: "",
    simExpiryDate: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [photoDraft, setPhotoDraft] = useState<DriverPhotoDraft | null>(null);
  const [simDocumentUrl, setSimDocumentUrl] = useState<string | null>(null);

  const minSimDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const provinceLocked =
    regionLocked && adminTier === "PROVINCE_ADMIN";
  const cityLockedToSingle =
    regionLocked && adminTier === "CITY_ADMIN" && Boolean(lockedCityName);

  const provinceIdNum = Number(formData.provinceId);

  const branchCities = useMemo(() => {
    if (!Number.isInteger(provinceIdNum) || provinceIdNum <= 0) return [];
    return filterCitiesForAdminScope(
      provinceIdNum,
      cityLockedToSingle ? lockedCityName : null
    );
  }, [provinceIdNum, cityLockedToSingle, lockedCityName]);

  useEffect(() => {
    if (branchCities.length === 1) {
      setFormData((f) =>
        f.cityName === branchCities[0] ? f : { ...f, cityName: branchCities[0] }
      );
    } else if (
      formData.cityName &&
      !branchCities.includes(formData.cityName)
    ) {
      setFormData((f) => ({ ...f, cityName: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.provinceId, branchCities]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!simDocumentUrl) {
      setError("Foto fisik SIM wajib diunggah terlebih dahulu");
      return;
    }

    const provinceId = Number(formData.provinceId);
    const cityName = formData.cityName.trim();

    if (!Number.isInteger(provinceId) || provinceId <= 0) {
      setError("Provinsi wajib dipilih");
      return;
    }
    if (!cityName) {
      setError("Kota cabang wajib dipilih");
      return;
    }
    if (!branchCities.includes(cityName)) {
      setError("Kota yang dipilih tidak sesuai dengan provinsi induk");
      return;
    }

    const payload: DriverRegInput = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      password: formData.password,
      vehiclePlate: formData.vehiclePlate.trim() || undefined,
      serviceCategory,
      provinceId,
      cityName,
      simNumber: formData.simNumber.trim(),
      simExpiryDate: formData.simExpiryDate,
      simDocumentUrl,
    };

    startTransition(async () => {
      const res = await registerDriverNational(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (photoDraft) {
        try {
          await uploadDriverPhoto(res.driverId, photoDraft);
          if (photoDraft.previewUrl) URL.revokeObjectURL(photoDraft.previewUrl);
        } catch {
          /* foto opsional */
        }
      }

      alert(res.message);
      router.push("/admin/drivers");
    });
  }

  return (
    <main className="p-6 text-slate-800">
      <div className="mb-6">
        <Link
          href="/admin/drivers"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Data Driver
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <UserPlus className="h-7 w-7 text-emerald-600" />
          Pendaftaran Driver Baru
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {scopeHint} · Tier {adminTier}
          {regionLocked && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
              <Lock className="h-3 w-3" />
              Wilayah terkunci sesuai yurisdiksi Anda
            </span>
          )}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      <form onSubmit={submit} className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Jenis Armada Fisik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
              {FLEET_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = serviceCategory === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setServiceCategory(opt.value)}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                      active
                        ? `${opt.accent} shadow-sm`
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <p className="mt-2 font-semibold">{opt.label}</p>
                    <p className="mt-1 text-xs opacity-80">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Identitas & Akun Login</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-slate-900">Nama lengkap</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Nama sesuai KTP"
                required
                minLength={3}
              />
            </div>
            <div>
              <Label className="text-slate-900">Telepon (untuk klaim akun di app driver)</Label>
              <Input
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="08xxxxxxxxxx"
                required
                minLength={8}
              />
            </div>
            <div>
              <Label className="text-slate-900">
                Plat kendaraan{" "}
                {serviceCategory === "MOTOR_HYBRID" ? "(motor)" : "(mobil)"}
              </Label>
              <Input
                value={formData.vehiclePlate}
                onChange={(e) =>
                  setFormData({ ...formData, vehiclePlate: e.target.value })
                }
                placeholder="F 1234 ABC (opsional)"
              />
            </div>
            <div>
              <Label className="text-slate-900">Email login</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label className="text-slate-900">Password awal</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                minLength={6}
                required
              />
            </div>
            <DriverPhotoPicker
              value={photoDraft}
              onChange={setPhotoDraft}
              disabled={pending}
            />
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <IdCard className="h-5 w-5 text-emerald-600" />
              Legalitas SIM (Wajib)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-slate-900">Nomor SIM</Label>
              <Input
                value={formData.simNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    simNumber: e.target.value.replace(/\D/g, "").slice(0, 16),
                  })
                }
                inputMode="numeric"
                pattern="[0-9]{8,16}"
                placeholder="Contoh: 12345678901234"
                required
                minLength={8}
                maxLength={16}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Hanya angka, 8–16 digit sesuai kartu SIM.
              </p>
            </div>
            <div>
              <Label className="text-slate-900">Tanggal masa berlaku SIM</Label>
              <Input
                type="date"
                value={formData.simExpiryDate}
                onChange={(e) =>
                  setFormData({ ...formData, simExpiryDate: e.target.value })
                }
                min={minSimDate}
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Sistem mengirim peringatan otomatis 30 hari sebelum habis.
              </p>
            </div>
            <SimDocumentUploader
              value={simDocumentUrl}
              onChange={setSimDocumentUrl}
              disabled={pending}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Zona Operasi</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="flex items-center gap-1.5 text-slate-900">
                Provinsi
                {provinceLocked && (
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                )}
              </Label>
              <select
                className={SELECT_CLASS}
                value={formData.provinceId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provinceId: e.target.value,
                    cityName: "",
                  })
                }
                disabled={provinceLocked || pending}
                required
              >
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="flex items-center gap-1.5 text-slate-900">
                Kota Cabang
                {cityLockedToSingle && (
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                )}
              </Label>
              <SearchableCitySelect
                key={`driver-city-${formData.provinceId}`}
                cities={branchCities}
                value={formData.cityName}
                onChange={(cityName) =>
                  setFormData({ ...formData, cityName })
                }
                disabled={cityLockedToSingle || pending}
                placeholder="— Ketik atau pilih kota cabang —"
                emptyMessage="— Pilih provinsi terlebih dahulu —"
                required
              />
              {formData.cityName && (
                <p className="mt-2 text-xs text-slate-600">
                  Wilayah: {formData.cityName}
                  {regionLocked && " (otomatis dari yurisdiksi admin)"}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-600">
                Daftar kota dari data master lokal — tidak bergantung API eksternal.
                Zona GPS harus sudah aktif di Manajemen Kota Layanan.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={
              pending ||
              branchCities.length === 0 ||
              !formData.cityName
            }
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Daftarkan Driver
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => router.push("/admin/drivers")}
          >
            Batal
          </Button>
        </div>
      </form>
    </main>
  );
}
