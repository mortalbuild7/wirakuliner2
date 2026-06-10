"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Merchant } from "@/types/database";
import { isStoreOpen } from "@/lib/merchant-open";
import { Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";

type MerchantRow = Merchant & {
  owner: { email: string | null; name: string } | null;
};

const EMPTY_FORM = {
  owner_name: "",
  email: "",
  password: "",
  shop_name: "",
  address: "",
  description: "",
  category: "makanan",
  lat: "-6.427760",
  lng: "106.727392",
};

type Props = {
  initialMerchants: MerchantRow[];
  scopeHint: string;
  adminTier: string;
};

export function DashboardMerchantsTable({
  initialMerchants,
  scopeHint,
  adminTier,
}: Props) {
  const [merchants, setMerchants] = useState<MerchantRow[]>(initialMerchants);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    shop_name: "",
    address: "",
    category: "",
  });
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    const res = await fetch("/api/admin/merchants", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as {
      merchants?: MerchantRow[];
      error?: string;
    };
    if (!res.ok) setError(json.error ?? "Gagal memuat merchant");
    else setMerchants(json.merchants ?? []);
    setListLoading(false);
  }, []);

  async function createMerchant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        owner_name: form.owner_name.trim(),
        email: form.email.trim(),
        password: form.password,
        shop_name: form.shop_name.trim(),
        address: form.address.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim(),
        latitude: Number(form.lat),
        longitude: Number(form.lng),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Gagal membuat toko");
      return;
    }
    setSuccess(`Toko ${form.shop_name} berhasil dibuat.`);
    setForm(EMPTY_FORM);
    setShowAdd(false);
    load();
  }

  function openEdit(m: MerchantRow) {
    setEditId(m.id);
    setEditForm({
      shop_name: m.name,
      address: m.address ?? "",
      category: m.category ?? "makanan",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/merchants/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        edit: true,
        name: editForm.shop_name.trim(),
        address: editForm.address.trim(),
        category: editForm.category.trim(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Gagal menyimpan");
      return;
    }
    setSuccess("Data warung diperbarui");
    setEditId(null);
    load();
  }

  async function deactivateMerchant(id: string, name: string) {
    const note = prompt("Catatan nonaktifkan/suspend (wajib):");
    if (!note?.trim()) return;
    if (!confirm(`Nonaktifkan merchant "${name}"?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/merchants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "suspend", note: note.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal menonaktifkan");
      return;
    }
    setSuccess(`Merchant ${name} dinonaktifkan`);
    load();
  }

  async function reactivateMerchant(id: string, name: string) {
    if (!confirm(`Aktifkan kembali "${name}"?`)) return;
    const res = await fetch(`/api/admin/merchants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "unsuspend" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Gagal mengaktifkan");
      return;
    }
    setSuccess(`Merchant ${name} diaktifkan`);
    load();
  }

  async function deleteMerchant(id: string, name: string) {
    if (!confirm(`Hapus permanen toko "${name}"?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/merchants/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ delete_owner: true }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal menghapus");
      return;
    }
    setSuccess(`Toko ${name} dihapus`);
    load();
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Store className="h-7 w-7 text-orange-600" />
            Data Merchant / Warung Kuliner
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeHint} · Tier {adminTier}
          </p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Partner Merchant
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

      {showAdd && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Buat Partner Merchant Baru</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createMerchant} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nama pemilik</Label>
                <Input
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  required
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
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>
              <div>
                <Label>Nama toko</Label>
                <Input
                  value={form.shop_name}
                  onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Alamat</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Kategori</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Lat</Label>
                  <Input
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Lng</Label>
                  <Input
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {editId && (
        <Card className="mb-6 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-lg">Edit Warung</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nama toko</Label>
                <Input
                  value={editForm.shop_name}
                  onChange={(e) => setEditForm({ ...editForm, shop_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Kategori</Label>
                <Input
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Alamat</Label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  required
                />
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
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-3">Toko</th>
              <th className="px-4 py-3">Pemilik</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Operasional</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Memuat...
                </td>
              </tr>
            ) : merchants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Tidak ada merchant di wilayah ini.
                </td>
              </tr>
            ) : (
              merchants.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.owner ? (
                      <>
                        {m.owner.name}
                        <br />
                        <span className="text-xs">{m.owner.email}</span>
                      </>
                    ) : (
                      <span className="text-amber-600">—</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                    {m.address ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {m.admin_suspended ? (
                      <span className="font-medium text-red-600">Nonaktif</span>
                    ) : m.is_active ? (
                      <span className="text-emerald-600">Aktif</span>
                    ) : (
                      <span className="text-slate-500">Tidak aktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.approval_status === "pending" ? "Menunggu" : "Disetujui"} ·{" "}
                    {isStoreOpen(m) ? "Buka" : "Tutup"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(m)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit Warung
                      </Button>
                      {m.admin_suspended ? (
                        <Button size="sm" variant="secondary" onClick={() => reactivateMerchant(m.id, m.name)}>
                          Aktifkan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => deactivateMerchant(m.id, m.name)}
                        >
                          Nonaktifkan
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMerchant(m.id, m.name)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
