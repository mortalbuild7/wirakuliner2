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

type ServiceCity = {
  id: string;
  name: string;
  province_id: number | null;
  city_id: number | null;
};

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
  cities,
  adminTier,
  scopeHint,
  regionLocked,
}: {
  cities: ServiceCity[];
  adminTier: string;
  scopeHint: string;
  /** true untuk CITY/PROVINCE admin → pilihan wilayah dikunci server-side. */
  regionLocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // State armada fisik — diubah otomatis oleh radio card.
  const [serviceCategory, setServiceCategory] =
    useState<ServiceCategory>("MOTOR_HYBRID");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    vehiclePlate: "",
    serviceCityId: "",
    simNumber: "",     // nomor SIM — disanitasi hanya angka saat diketik
    simExpiryDate: "", // tanggal masa berlaku — wajib di masa depan
  });
  const [photoDraft, setPhotoDraft] = useState<DriverPhotoDraft | null>(null);
  // Public URL foto fisik SIM di bucket 'driver-documents' — di-set oleh
  // SimDocumentUploader setelah upload sukses; wajib terisi sebelum submit.
  const [simDocumentUrl, setSimDocumentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Batas bawah input tanggal: besok — SIM yang habis hari ini ditolak dini.
  const minSimDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  // CITY_ADMIN umumnya hanya punya satu kota → otomatis terpilih & terkunci.
  useEffect(() => {
    if (cities.length && !form.serviceCityId) {
      setForm((f) => ({ ...f, serviceCityId: cities[0].id }));
    }
  }, [cities, form.serviceCityId]);

  const cityLockedToSingle = regionLocked && cities.length === 1;
  const selectedCity = cities.find((c) => c.id === form.serviceCityId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Guard sisi client: dokumen SIM wajib terunggah sebelum kirim payload —
    // validasi otoritatif tetap diulang server-side (zod + cek asal bucket).
    if (!simDocumentUrl) {
      setError("Foto fisik SIM wajib diunggah terlebih dahulu");
      return;
    }

    // Payload dikirim ke Server Action — validasi otoritatif (zod +
    // geofencing + anti-duplikat) berjalan di server, bukan di browser.
    const payload: DriverRegInput = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      password: form.password,
      vehiclePlate: form.vehiclePlate.trim() || undefined,
      serviceCategory,
      serviceCityId: form.serviceCityId,
      simNumber: form.simNumber.trim(),
      simExpiryDate: form.simExpiryDate,
      simDocumentUrl,
    };

    startTransition(async () => {
      const res = await registerDriverNational(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      // Foto opsional — diunggah SETELAH armada tercatat (butuh driverId).
      if (photoDraft) {
        try {
          await uploadDriverPhoto(res.driverId, photoDraft);
          if (photoDraft.previewUrl) URL.revokeObjectURL(photoDraft.previewUrl);
        } catch {
          /* foto opsional — kegagalan tidak membatalkan pendaftaran */
        }
      }

      alert(res.message);
      // Kembali ke tabel driver — data baru langsung tampil (revalidated).
      router.push("/admin/drivers");
    });
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link
          href="/admin/drivers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Data Driver
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
          <UserPlus className="h-7 w-7 text-emerald-600" />
          Pendaftaran Driver Baru
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
            {/* Radio card interaktif — klik kartu = ubah state serviceCategory */}
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
                      "rounded-xl border-2 p-4 text-left transition",
                      active
                        ? `${opt.accent} shadow-sm`
                        : "border-border bg-background hover:border-muted-foreground/40"
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
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nama sesuai KTP"
                required
                minLength={3}
              />
            </div>
            <div>
              <Label>Telepon (untuk klaim akun di app driver)</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                value={form.vehiclePlate}
                onChange={(e) =>
                  setForm({ ...form, vehiclePlate: e.target.value })
                }
                placeholder="F 1234 ABC (opsional)"
              />
            </div>
            <div>
              <Label>Email login</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Password awal</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
              {/* inputMode numeric + sanitasi onChange: non-digit dibuang
                  langsung saat diketik — hanya angka yang masuk state. */}
              <Input
                value={form.simNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
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
              <p className="mt-1 text-[11px] text-muted-foreground">
                Hanya angka, 8–16 digit sesuai kartu SIM.
              </p>
            </div>
            <div>
              <Label>Tanggal masa berlaku SIM</Label>
              {/* min = besok: browser menolak tanggal lampau; server tetap
                  memvalidasi ulang (zod refine masa depan). */}
              <Input
                type="date"
                value={form.simExpiryDate}
                onChange={(e) =>
                  setForm({ ...form, simExpiryDate: e.target.value })
                }
                min={minSimDate}
                required
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sistem mengirim peringatan otomatis 30 hari sebelum habis.
              </p>
            </div>
            {/* Upload bukti fisik → Public URL di-set ke state simDocumentUrl */}
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
          <CardContent>
            <Label className="flex items-center gap-1.5">
              Kota layanan
              {cityLockedToSingle && <Lock className="h-3.5 w-3.5 text-amber-600" />}
            </Label>
            {/* Terkunci untuk admin regional: pilihan sudah difilter
                server-side; CITY_ADMIN dengan satu kota tidak bisa mengubah. */}
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={form.serviceCityId}
              onChange={(e) =>
                setForm({ ...form, serviceCityId: e.target.value })
              }
              disabled={cityLockedToSingle || pending}
              required
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedCity && (
              <p className="mt-2 text-xs text-muted-foreground">
                Kode wilayah: Provinsi {selectedCity.province_id ?? "—"} · Kota{" "}
                {selectedCity.city_id ?? "—"}{" "}
                {regionLocked && "(otomatis dari yurisdiksi admin)"}
              </p>
            )}
            {cities.length === 0 && (
              <p className="mt-2 text-xs text-red-600">
                Tidak ada kota layanan aktif di wilayah Anda — tambahkan dulu di
                menu Kota.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={pending || cities.length === 0}
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
