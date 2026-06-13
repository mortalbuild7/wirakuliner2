"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  resolveDriverCityLabel,
  type DriverCityDisplayRow,
} from "@/lib/admin/drivers-list-display";
import type { Driver } from "@/types/database";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import { ACCOUNT_STATUS_LABEL } from "@/lib/account-status";
import { Bike, Pencil, Plus, Search, ShieldCheck, UserX } from "lucide-react";

type AdminDriverRow = Driver &
  DriverCityDisplayRow & {
    profiles: { email: string | null; account_status?: string | null; phone?: string | null } | null;
  };

type ServiceCity = { id: string; name: string };

type FilterCityOption = { id: number; name: string; province_id: number };

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";

type Props = {
  initialDrivers: AdminDriverRow[];
  initialCities: ServiceCity[];
  scopeHint: string;
  adminTier: string;
  isSuperAdmin?: boolean;
  isCityAdmin?: boolean;
  lockedProvinceId?: number | null;
  lockedCityId?: number | null;
  lockedCityName?: string | null;
  provinces?: readonly IndonesiaProvince[];
};

const FLEET_LABEL: Record<string, string> = {
  MOTOR_HYBRID: "Motor Hybrid",
  MOBIL_PASSENGER: "Mobil Penumpang",
  MOBIL_CARGO: "Mobil Cargo",
};

type SimStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "MISSING";

function simStatus(expiry?: string | null): SimStatus {
  if (!expiry) return "MISSING";
  const exp = new Date(`${expiry}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (exp.getTime() < today.getTime()) return "EXPIRED";
  const graceEnd = new Date(today);
  graceEnd.setDate(graceEnd.getDate() + 30);
  if (exp.getTime() <= graceEnd.getTime()) return "EXPIRING_SOON";
  return "ACTIVE";
}

const SIM_BADGE: Record<SimStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "SIM Aktif",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  EXPIRING_SOON: {
    label: "Segera Habis",
    className: "border-amber-300 bg-amber-50 text-amber-700",
  },
  EXPIRED: {
    label: "Kedaluwarsa",
    className: "border-red-300 bg-red-50 text-red-700",
  },
  MISSING: {
    label: "Belum Ada",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
};

function formatSimDate(expiry?: string | null): string | null {
  if (!expiry) return null;
  return new Date(`${expiry}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SimStatusBadge({ d }: { d: AdminDriverRow }) {
  const status = simStatus(d.sim_expiry_date);
  const cfg = SIM_BADGE[status];
  const dateLabel = formatSimDate(d.sim_expiry_date);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
        title={d.sim_number ? `No. SIM ${d.sim_number}` : "Nomor SIM belum tercatat"}
      >
        <ShieldCheck className="h-3 w-3" />
        {cfg.label}
      </span>
      {dateLabel && (
        <span className="text-[10px] text-slate-500">s/d {dateLabel}</span>
      )}
      {d.sim_document_url && (
        <a
          href={d.sim_document_url}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-sky-600 underline-offset-2 hover:underline"
        >
          Lihat dokumen
        </a>
      )}
    </div>
  );
}

function buildDriversQueryString(opts: {
  isSuperAdmin: boolean;
  search: string;
  provinceId: string;
  cityId: string;
}): string {
  const params = new URLSearchParams();
  params.set("region", opts.isSuperAdmin ? "all" : "scoped");
  if (opts.search) params.set("q", opts.search);
  if (opts.isSuperAdmin && opts.provinceId) {
    params.set("provinceId", opts.provinceId);
  }
  if (opts.isSuperAdmin && opts.cityId) {
    params.set("cityId", opts.cityId);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function DashboardDriversTable({
  initialDrivers,
  initialCities,
  scopeHint,
  adminTier,
  isSuperAdmin = false,
  isCityAdmin = false,
  lockedProvinceId = null,
  lockedCityId = null,
  lockedCityName = null,
  provinces = [],
}: Props) {
  const [drivers, setDrivers] = useState<AdminDriverRow[]>(initialDrivers);
  const [cities] = useState(initialCities);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [provinceId, setProvinceId] = useState(
    isCityAdmin && lockedProvinceId ? String(lockedProvinceId) : ""
  );
  const [cityId, setCityId] = useState(
    isCityAdmin && lockedCityId ? String(lockedCityId) : ""
  );
  const [filterCities, setFilterCities] = useState<FilterCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    plate: "",
    service_city_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isFirstSearchEffect = useRef(true);

  const wilayahLocked = isCityAdmin || (!isSuperAdmin && adminTier === "PROVINCE_ADMIN");

  const lockedProvinceLabel = useMemo(() => {
    if (!lockedProvinceId) return "Wilayah Anda";
    return (
      provinces.find((p) => p.id === lockedProvinceId)?.name ??
      `Provinsi ID ${lockedProvinceId}`
    );
  }, [lockedProvinceId, provinces]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchDebounced(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!isSuperAdmin || !provinceId) {
      setFilterCities([]);
      if (!isCityAdmin) setCityId("");
      return;
    }

    let cancelled = false;
    setCitiesLoading(true);

    void fetch(
      `/api/admin/drivers/filter-cities?provinceId=${encodeURIComponent(provinceId)}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((json: { cities?: FilterCityOption[] }) => {
        if (cancelled) return;
        setFilterCities(json.cities ?? []);
        setCitiesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setCitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, provinceId, isCityAdmin]);

  const load = useCallback(async () => {
    setListLoading(true);
    const qs = buildDriversQueryString({
      isSuperAdmin,
      search: searchDebounced,
      provinceId,
      cityId,
    });

    const res = await fetch(`/api/admin/drivers${qs}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as {
      drivers?: AdminDriverRow[];
      error?: string;
    };

    if (!res.ok) {
      setError(json.error ?? "Gagal memuat driver");
    } else {
      const rows = json.drivers ?? [];
      console.log("Daftar Driver Terambil:", rows);
      setDrivers(rows);
      setError(null);
    }
    setListLoading(false);
  }, [isSuperAdmin, searchDebounced, provinceId, cityId]);

  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }
    void load();
  }, [load]);

  function openEdit(d: AdminDriverRow) {
    setEditId(d.id);
    setEditForm({
      name: d.name,
      phone: d.phone,
      plate: d.vehicle_plate ?? "",
      service_city_id: d.service_city_id ?? "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/drivers/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        vehicle_plate: editForm.plate.trim() || null,
        service_city_id: editForm.service_city_id,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Gagal menyimpan perubahan");
      return;
    }
    setSuccess("Data driver diperbarui");
    setEditId(null);
    void load();
  }

  async function toggleSuspend(d: AdminDriverRow) {
    const suspended = d.profiles?.account_status === "suspended";
    const action = suspended ? "unsuspend" : "suspend";
    if (action === "suspend") {
      const note = prompt("Catatan suspend (wajib):");
      if (!note?.trim()) return;
      if (!confirm(`Suspend akun driver "${d.name}"?`)) return;
      await patchDriverAction(d.id, action, note.trim());
    } else {
      if (!confirm(`Aktifkan kembali akun "${d.name}"?`)) return;
      await patchDriverAction(d.id, action);
    }
  }

  async function patchDriverAction(
    id: string,
    action: "suspend" | "unsuspend",
    note?: string
  ) {
    setError(null);
    const res = await fetch(`/api/admin/drivers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, note }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal memproses aksi");
      return;
    }
    setSuccess(action === "suspend" ? "Akun driver disuspend" : "Akun driver diaktifkan");
    void load();
  }

  async function deleteDriver(id: string, name: string) {
    if (!confirm(`Hapus permanen driver "${name}"?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/drivers/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal menghapus");
      return;
    }
    setSuccess(`Driver ${name} dihapus`);
    void load();
  }

  return (
    <main className="p-6 text-slate-800">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Bike className="h-7 w-7 text-emerald-600" />
            Data Driver
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {scopeHint} · Tier {adminTier}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/admin/drivers/new">
            <Plus className="h-4 w-4" />
            Daftarkan Driver Baru
          </Link>
        </Button>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <Label className="text-xs font-medium text-slate-700">Pencarian</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9 text-slate-900"
              placeholder="Cari NIK atau No. Telepon..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-slate-700">Provinsi</Label>
          <select
            className={`${SELECT_CLASS} mt-1`}
            value={provinceId}
            onChange={(e) => {
              setProvinceId(e.target.value);
              setCityId("");
            }}
            disabled={wilayahLocked || !isSuperAdmin}
          >
            <option value="">
              {isSuperAdmin ? "— Semua provinsi —" : lockedProvinceLabel}
            </option>
            {isSuperAdmin &&
              provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <Label className="text-xs font-medium text-slate-700">Kota / Kabupaten</Label>
          <select
            className={`${SELECT_CLASS} mt-1`}
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            disabled={
              wilayahLocked ||
              !isSuperAdmin ||
              (!provinceId && !isCityAdmin) ||
              citiesLoading
            }
          >
            <option value="">
              {isCityAdmin
                ? lockedCityName ?? `Kota ID ${lockedCityId ?? ""}`
                : citiesLoading
                  ? "Memuat kota..."
                  : provinceId
                    ? "— Semua kota —"
                    : "— Pilih provinsi dulu —"}
            </option>
            {isSuperAdmin &&
              filterCities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mb-4 border-emerald-500/40 bg-emerald-500/10 text-emerald-900">
          {success}
        </Alert>
      )}

      {editId && (
        <Card className="mb-6 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Edit Data Driver</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nama</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Telepon</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Plat</Label>
                <Input
                  value={editForm.plate}
                  onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })}
                />
              </div>
              <div>
                <Label>Kota layanan</Label>
                <select
                  className="mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-900"
                  value={editForm.service_city_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, service_city_id: e.target.value })
                  }
                  required
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={loading}>
                  Simpan Perubahan
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditId(null)}>
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="wira-table-wrap min-w-[900px]">
        <table>
          <thead>
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kontak / NIK</th>
              <th className="px-4 py-3">Armada</th>
              <th className="px-4 py-3">Legalitas SIM</th>
              <th className="px-4 py-3">Kota</th>
              <th className="px-4 py-3">Status GPS</th>
              <th className="px-4 py-3">Akun</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-600">
                  Memuat...
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-600">
                  Tidak ada driver yang cocok dengan filter ini.
                </td>
              </tr>
            ) : (
              drivers.map((d) => {
                const acct = (d.profiles?.account_status ?? "active").toLowerCase();
                const suspended = acct === "suspended" || acct === "blocked";
                const acctLabel =
                  ACCOUNT_STATUS_LABEL[acct as keyof typeof ACCOUNT_STATUS_LABEL] ??
                  (acct === "pending" ? "Menunggu" : acct);

                return (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {d.phone}
                      <br />
                      <span className="text-xs text-slate-600">
                        {d.profiles?.email ?? "—"}
                      </span>
                      {d.nik && (
                        <>
                          <br />
                          <span className="text-xs text-slate-500">NIK {d.nik}</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900">
                      {FLEET_LABEL[d.service_category ?? ""] ?? "Motor Hybrid"}
                    </td>
                    <td className="px-4 py-3">
                      <SimStatusBadge d={d} />
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {resolveDriverCityLabel(d)}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-900">{d.status}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          suspended ? "font-medium text-red-600" : "text-emerald-600"
                        }
                      >
                        {acctLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={suspended ? "outline" : "secondary"}
                          onClick={() => toggleSuspend(d)}
                        >
                          <UserX className="mr-1 h-3.5 w-3.5" />
                          {suspended ? "Aktifkan" : "Suspend"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteDriver(d.id, d.name)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
