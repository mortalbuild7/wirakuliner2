"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getActiveCitiesByProvince,
  type ActiveCityOption,
} from "@/app/actions/locationActions";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
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
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Radio card armada fisik — satu driver satu kategori (anti-redundancy).
 * Kategori menentukan job yang boleh diterima algoritma dispatch v2.
 */
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
}: {
  provinces: IndonesiaProvince[];
  /** Provinsi awal — dari yurisdiksi admin regional atau provinsi pertama. */
  defaultProvinceId: number;
  adminTier: string;
  scopeHint: string;
  /** true untuk CITY/PROVINCE admin → pilihan wilayah dikunci server-side. */
  regionLocked: boolean;
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
    cityId: "",
    simNumber: "",
    simExpiryDate: "",
  });

  const [branchCities, setBranchCities] = useState<ActiveCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [photoDraft, setPhotoDraft] = useState<DriverPhotoDraft | null>(null);
  const [simDocumentUrl, setSimDocumentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minSimDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const provinceLocked =
    regionLocked && adminTier === "PROVINCE_ADMIN";
  const cityLockedToSingle =
    regionLocked && adminTier === "CITY_ADMIN" && branchCities.length === 1;

  const selectedCity = branchCities.find(
    (c) => String(c.cityId) === formData.cityId
  );

  // Muat ulang kota cabang setiap provinsi berubah — sinkron dengan Manajemen Kota.
  useEffect(() => {
    const provinceId = Number(formData.provinceId);
    if (!Number.isInteger(provinceId) || provinceId <= 0) {
      setBranchCities([]);
      setFormData((f) => ({ ...f, cityId: "" }));
      return;
    }

    let cancelled = false;
    setCitiesLoading(true);
    setCitiesError(null);

    void getActiveCitiesByProvince(provinceId).then((res) => {
      if (cancelled) return;
      setCitiesLoading(false);

      if (!res.ok) {
        setBranchCities([]);
        setFormData((f) => ({ ...f, cityId: "" }));
        setCitiesError(res.error);
        return;
      }

      setBranchCities(res.cities);
      setFormData((f) => ({
        ...f,
        cityId:
          res.cities.length === 1 ? String(res.cities[0].cityId) : "",
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [formData.provinceId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!simDocumentUrl) {
      setError("Foto fisik SIM wajib diunggah terlebih dahulu");
      return;
    }

    const provinceId = Number(formData.provinceId);
    const cityId = Number(formData.cityId);

    if (!Number.isInteger(provinceId) || provinceId <= 0) {
      setError("Provinsi wajib dipilih");
      return;
    }
    if (!Number.isInteger(cityId) || cityId <= 0) {
      setError("Kota cabang wajib dipilih");
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
      cityId,
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
            <CardTitle className="text-lg">Jenis Armada Fisik</CardTitle>
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
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
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
            <CardTitle className="text-lg">Identitas & Akun Login</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nama lengkap</Label>
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
              <Label>Telepon (untuk klaim akun di app driver)</Label>
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
              <Label>
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
              <Label>Email login</Label>
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
              <Label>Password awal</Label>
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <IdCard className="h-5 w-5 text-emerald-600" />
              Legalitas SIM (Wajib)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nomor SIM</Label>
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
              <Label>Tanggal masa berlaku SIM</Label>
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
            <CardTitle className="text-lg">Zona Operasi</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="flex items-center gap-1.5">
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
                    cityId: "",
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
              <Label className="flex items-center gap-1.5">
                Kota Cabang
                {cityLockedToSingle && (
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                )}
              </Label>
              <select
                className={SELECT_CLASS}
                value={formData.cityId}
                onChange={(e) =>
                  setFormData({ ...formData, cityId: e.target.value })
                }
                disabled={
                  cityLockedToSingle || pending || citiesLoading || branchCities.length === 0
                }
                required
              >
                <option value="">
                  {citiesLoading
                    ? "Memuat kota…"
                    : branchCities.length === 0
                      ? "— Pilih provinsi terlebih dahulu —"
                      : "— Pilih kota cabang —"}
                </option>
                {branchCities.map((c) => (
                  <option key={c.cityId} value={c.cityId}>
                    {c.name}
                  </option>
                ))}
              </select>
              {citiesLoading && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Memuat daftar kota layanan…
                </p>
              )}
              {citiesError && (
                <p className="mt-2 text-xs text-red-600">{citiesError}</p>
              )}
              {selectedCity && (
                <p className="mt-2 text-xs text-slate-600">
                  Kode wilayah: Provinsi {selectedCity.provinceId} · Kota{" "}
                  {selectedCity.cityId}
                  {regionLocked && " (otomatis dari yurisdiksi admin)"}
                </p>
              )}
              {!citiesLoading &&
                !citiesError &&
                branchCities.length === 0 &&
                formData.provinceId && (
                  <p className="mt-2 text-xs text-red-600">
                    Tidak ada kota layanan aktif di provinsi ini — aktifkan dulu
                    di menu Manajemen Kota.
                  </p>
                )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={
              pending ||
              citiesLoading ||
              branchCities.length === 0 ||
              !formData.cityId
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
