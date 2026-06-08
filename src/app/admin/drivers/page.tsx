"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import type { Driver } from "@/types/database";
import {
  DriverPhotoPicker,
  uploadDriverPhoto,
  type DriverPhotoDraft,
} from "@/components/admin/driver-photo-picker";
import Image from "next/image";
import { Bike, Loader2 } from "lucide-react";

type ServiceCity = {
  id: string;
  name: string;
};

type DriverRow = Driver & {
  profiles: { email: string | null } | null;
  service_cities?: { name: string } | { name: string }[] | null;
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  plate: "",
  email: "",
  password: "",
  service_city_id: "",
};

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoDraft, setPhotoDraft] = useState<DriverPhotoDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cities, setCities] = useState<ServiceCity[]>([]);
  const supabase = createClient();

  const loadCities = useCallback(async () => {
    const res = await fetch("/api/admin/cities", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { cities?: ServiceCity[] };
    const list = json.cities ?? [];
    setCities(list);
    if (list.length) {
      setForm((f) => (f.service_city_id ? f : { ...f, service_city_id: list[0].id }));
    }
  }, []);

  const load = useCallback(async () => {
    setListLoading(true);
    const { data, error: loadErr } = await supabase
      .from("drivers")
      .select("*, profiles(email), service_cities(name)")
      .order("created_at", { ascending: false });

    if (loadErr) {
      setError(loadErr.message);
    } else {
      setDrivers((data as DriverRow[]) ?? []);
    }
    setListLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    void loadCities();
  }, [load, loadCities]);

  async function updateDriverCity(driverId: string, serviceCityId: string) {
    const res = await fetch(`/api/admin/drivers/${driverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ service_city_id: serviceCityId }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal mengubah kota driver");
      return;
    }
    setSuccess("Kota driver diperbarui");
    load();
  }

  async function deleteDriver(id: string, name: string) {
    if (
      !confirm(
        `Hapus permanen driver "${name}" beserta akun login? Tindakan ini tidak bisa dibatalkan.`
      )
    ) {
      return;
    }

    setError(null);
    const res = await fetch(`/api/admin/drivers/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal menghapus driver");
      return;
    }
    setSuccess(`Driver ${name} berhasil dihapus`);
    load();
  }

  async function registerDriver(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim(),
        vehicle_plate: form.plate.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        service_city_id: form.service_city_id,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      email?: string;
      driverId?: string;
    };

    if (!res.ok) {
      setLoading(false);
      setError(body.error ?? "Gagal mendaftarkan driver");
      return;
    }

    let photoNote = "";
    if (photoDraft && body.driverId) {
      try {
        await uploadDriverPhoto(body.driverId, photoDraft);
        photoNote = " Foto profil berhasil diunggah.";
        if (photoDraft.previewUrl) URL.revokeObjectURL(photoDraft.previewUrl);
        setPhotoDraft(null);
      } catch (photoErr) {
        photoNote = ` (foto gagal: ${photoErr instanceof Error ? photoErr.message : "error"})`;
      }
    }

    setLoading(false);
    setSuccess(
      `Driver ${form.name} berhasil dibuat. Login: ${body.email ?? form.email}.${photoNote}`
    );
    setForm(EMPTY_FORM);
    load();
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bike className="h-7 w-7 text-emerald-600" />
          Kelola Driver
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Daftarkan driver baru: admin membuat akun login (email & password) sekaligus profil
          driver. Driver cukup masuk di aplikasi driver dengan kredensial tersebut.
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
        <h2 className="text-lg font-semibold">Pendaftaran Driver Baru</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Semua field wajib kecuali plat kendaraan.
        </p>

        <form onSubmit={registerDriver} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="driver-name">Nama lengkap</Label>
            <Input
              id="driver-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Budi Santoso"
              required
            />
          </div>
          <div>
            <Label htmlFor="driver-phone">Nomor telepon</Label>
            <Input
              id="driver-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="08xxxxxxxxxx"
              required
            />
          </div>
          <div>
            <Label htmlFor="driver-plate">Plat kendaraan (opsional)</Label>
            <Input
              id="driver-plate"
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
              placeholder="DD 1234 AB"
            />
          </div>
          <div>
            <Label htmlFor="driver-email">Email login</Label>
            <Input
              id="driver-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="driver@email.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="driver-password">Password awal</Label>
            <Input
              id="driver-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min. 6 karakter"
              minLength={6}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="driver-city">Kota layanan</Label>
            <select
              id="driver-city"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.service_city_id}
              onChange={(e) => setForm({ ...form, service_city_id: e.target.value })}
              required
            >
              <option value="">Pilih kota...</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Driver hanya menerima order di kota ini. Kelola kota di menu Kota Layanan.
            </p>
          </div>
          <DriverPhotoPicker
            value={photoDraft}
            onChange={setPhotoDraft}
            disabled={loading}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Daftarkan driver"
              )}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Daftar driver ({drivers.length})</h2>
        {listLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Memuat...</p>
        ) : drivers.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Belum ada driver terdaftar.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {drivers.map((d) => (
              <li key={d.id} className="flex gap-3 rounded-lg border bg-card p-4 text-sm">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                  {d.photo_url ? (
                    <Image
                      src={d.photo_url}
                      alt={d.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                <p className="font-medium">{d.name}</p>
                <p className="text-muted-foreground">
                  {d.phone}
                  {d.vehicle_plate ? ` · ${d.vehicle_plate}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Email: {d.profiles?.email ?? "—"} · Status:{" "}
                  <span className="capitalize">{d.status}</span>
                  {" · "}
                  Kota:{" "}
                  {Array.isArray(d.service_cities)
                    ? d.service_cities[0]?.name
                    : d.service_cities?.name ?? "Belum diatur"}
                </p>
                {cities.length > 0 && (
                  <select
                    className="mt-2 flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={
                      (d as Driver & { service_city_id?: string }).service_city_id ?? ""
                    }
                    onChange={(e) => void updateDriverCity(d.id, e.target.value)}
                  >
                    <option value="">Ubah kota...</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-xs">
                  Akun:{" "}
                  {d.profile_id ? (
                    <span className="font-medium text-emerald-600">Aktif — siap login</span>
                  ) : (
                    <span className="text-amber-600">Belum punya akun login</span>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-2"
                  onClick={() => deleteDriver(d.id, d.name)}
                >
                  Hapus driver
                </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
