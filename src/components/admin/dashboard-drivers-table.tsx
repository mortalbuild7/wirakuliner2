"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Driver } from "@/types/database";
import { ACCOUNT_STATUS_LABEL } from "@/lib/account-status";
import { Bike, Pencil, Plus, UserX } from "lucide-react";

type ServiceCity = { id: string; name: string };

type DriverRow = Driver & {
  profiles: { email: string | null; account_status?: string | null } | null;
  service_cities?: { name: string } | { name: string }[] | null;
};

type Props = {
  initialDrivers: DriverRow[];
  initialCities: ServiceCity[];
  scopeHint: string;
  adminTier: string;
};

function cityName(d: DriverRow): string {
  if (Array.isArray(d.service_cities)) return d.service_cities[0]?.name ?? "—";
  return d.service_cities?.name ?? "—";
}

/** Label armada fisik — pemisahan MOTOR_HYBRID / MOBIL_PASSENGER / MOBIL_CARGO. */
const FLEET_LABEL: Record<string, string> = {
  MOTOR_HYBRID: "Motor Hybrid",
  MOBIL_PASSENGER: "Mobil Penumpang",
  MOBIL_CARGO: "Mobil Cargo",
};

export function DashboardDriversTable({
  initialDrivers,
  initialCities,
  scopeHint,
  adminTier,
}: Props) {
  const [drivers, setDrivers] = useState<DriverRow[]>(initialDrivers);
  const [cities] = useState(initialCities);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", plate: "", service_city_id: "" });
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    const res = await fetch("/api/admin/drivers", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as {
      drivers?: DriverRow[];
      error?: string;
    };
    if (!res.ok) setError(json.error ?? "Gagal memuat driver");
    else setDrivers(json.drivers ?? []);
    setListLoading(false);
  }, []);

  function openEdit(d: DriverRow) {
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
    load();
  }

  async function toggleSuspend(d: DriverRow) {
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

  async function patchDriverAction(id: string, action: "suspend" | "unsuspend", note?: string) {
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
    load();
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
    load();
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bike className="h-7 w-7 text-emerald-600" />
            Data Driver
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeHint} · Tier {adminTier}
          </p>
        </div>
        {/* Redirect ke form pendaftaran nasional (armada MOTOR/MOBIL/CARGO) */}
        <Button asChild className="gap-2">
          <Link href="/admin/drivers/new">
            <Plus className="h-4 w-4" />
            Daftarkan Driver Baru
          </Link>
        </Button>
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
            <CardTitle className="text-lg">Edit Data Driver</CardTitle>
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
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kontak</th>
              <th className="px-4 py-3">Armada</th>
              <th className="px-4 py-3">Kota</th>
              <th className="px-4 py-3">Status GPS</th>
              <th className="px-4 py-3">Akun</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Memuat...
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Tidak ada driver di wilayah ini.
                </td>
              </tr>
            ) : (
              drivers.map((d) => {
                const acct = d.profiles?.account_status ?? "active";
                const suspended = acct === "suspended" || acct === "blocked";
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.phone}
                      <br />
                      <span className="text-xs">{d.profiles?.email ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {FLEET_LABEL[d.service_category ?? ""] ?? "Motor Hybrid"}
                    </td>
                    <td className="px-4 py-3">{cityName(d)}</td>
                    <td className="px-4 py-3 capitalize">{d.status}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          suspended ? "font-medium text-red-600" : "text-emerald-600"
                        }
                      >
                        {ACCOUNT_STATUS_LABEL[acct as keyof typeof ACCOUNT_STATUS_LABEL] ??
                          acct}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit Data
                        </Button>
                        <Button
                          size="sm"
                          variant={suspended ? "outline" : "secondary"}
                          onClick={() => toggleSuspend(d)}
                        >
                          <UserX className="mr-1 h-3.5 w-3.5" />
                          {suspended ? "Aktifkan" : "Suspend Akun"}
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
