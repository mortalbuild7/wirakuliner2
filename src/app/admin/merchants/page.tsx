"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import type { Merchant } from "@/types/database";
import { verifyMerchant } from "@/app/actions/adminActions";
import { isStoreOpen } from "@/lib/merchant-open";
import { Loader2, Store } from "lucide-react";

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

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const supabase = createClient();

  const load = useCallback(async () => {
    setListLoading(true);
    const { data, error: loadErr } = await supabase
      .from("merchants")
      .select("*, owner:profiles!owner_id(email, name)")
      .order("created_at", { ascending: false });

    if (loadErr) {
      setError(loadErr.message);
    } else {
      setMerchants((data as MerchantRow[]) ?? []);
    }
    setListLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function createMerchant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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

    const body = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Gagal membuat toko");
      return;
    }

    setSuccess(`Toko ${form.shop_name} berhasil dibuat. Login merchant: ${body.email ?? form.email}`);
    setForm(EMPTY_FORM);
    load();
  }

  async function deleteMerchant(id: string, name: string) {
    if (
      !confirm(
        `Hapus permanen toko "${name}" beserta menu, riwayat pesanan, dan akun pemilik? Tidak bisa dibatalkan.`
      )
    ) {
      return;
    }

    setError(null);
    const res = await fetch(`/api/admin/merchants/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ delete_owner: true }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal menghapus toko");
      return;
    }
    setSuccess(`Toko ${name} berhasil dihapus`);
    load();
  }

  /** Verifikasi pendaftaran via Server Action + Zod (anti mass-assignment). */
  async function verifyMerchantAction(
    id: string,
    status: "approved" | "rejected"
  ) {
    const note = actionNote[id]?.trim();
    if (status === "rejected" && !note) {
      alert("Isi catatan admin untuk penolakan");
      return;
    }

    const label = status === "approved" ? "setujui pendaftaran" : "tolak pendaftaran";
    if (!confirm(`Yakin ${label} toko ini?`)) return;

    setError(null);
    const result = await verifyMerchant({
      merchantId: id,
      status_verifikasi: status,
      catatan_admin: note || undefined,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.message ?? `Verifikasi "${status}" berhasil`);
    load();
  }

  async function merchantAction(
    id: string,
    action:
      | "suspend"
      | "unsuspend"
      | "force_close"
      | "disconnect"
      | "activate"
  ) {
    const note = actionNote[id]?.trim();
    if ((action === "suspend" || action === "disconnect") && !note) {
      alert("Isi catatan admin untuk aksi ini");
      return;
    }

    const labels: Record<string, string> = {
      suspend: "suspend toko ini",
      unsuspend: "batalkan suspend",
      force_close: "tutup paksa toko (is_open=false)",
      disconnect: "putus hubungan mitra (owner dikosongkan)",
      activate: "aktifkan kembali toko",
    };

    if (!confirm(`Yakin ${labels[action]}?`)) return;

    setError(null);
    const res = await fetch(`/api/admin/merchants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, note: note || undefined }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Gagal memproses aksi");
      return;
    }
    setSuccess(`Aksi "${action}" berhasil`);
    load();
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Store className="h-7 w-7 text-orange-600" />
          Kelola Merchant / Toko
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Buat toko baru (langsung disetujui) atau setujui pendaftaran mandiri merchant. Suspend,
          hapus toko, atau putus hubungan mitra bila diperlukan.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 max-w-3xl">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mb-4 max-w-3xl border-emerald-500/40 bg-emerald-500/10 text-emerald-900">
          {success}
        </Alert>
      )}

      <section className="max-w-3xl rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Buat Toko Baru</h2>
        <form onSubmit={createMerchant} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nama pemilik</Label>
            <Input
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Email login merchant</Label>
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
          <div className="sm:col-span-2">
            <Label>Deskripsi (opsional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              <Input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </div>
            <div>
              <Label>Lng</Label>
              <Input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Buat toko & akun merchant
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Daftar toko ({merchants.length})</h2>
        {listLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Memuat...</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {merchants.map((m) => (
              <li key={m.id} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-muted-foreground">{m.address ?? "—"}</p>
                    <p className="mt-1 text-xs">
                      Pemilik:{" "}
                      {m.owner ? (
                        <span>
                          {m.owner.name} ({m.owner.email})
                        </span>
                      ) : (
                        <span className="text-amber-600">Tidak terhubung</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Persetujuan:{" "}
                      {m.approval_status === "pending" ? (
                        <span className="font-medium text-amber-600">Menunggu approval</span>
                      ) : m.approval_status === "rejected" ? (
                        <span className="font-medium text-red-600">Ditolak</span>
                      ) : (
                        <span className="text-emerald-600">Disetujui</span>
                      )}
                      {" · "}
                      Status:{" "}
                      {m.admin_suspended ? (
                        <span className="font-medium text-red-600">Suspend admin</span>
                      ) : m.is_active ? (
                        <span className="text-emerald-600">Aktif</span>
                      ) : (
                        <span className="text-slate-500">Nonaktif</span>
                      )}
                      {" · "}
                      Buka/tutup: {isStoreOpen(m) ? "Buka" : "Tutup"}
                    </p>
                    {m.rejection_note && (
                      <p className="mt-1 text-xs italic text-red-700">Alasan tolak: {m.rejection_note}</p>
                    )}
                    {m.admin_note && (
                      <p className="mt-1 text-xs italic text-amber-700">Catatan: {m.admin_note}</p>
                    )}
                  </div>
                </div>

                <Input
                  className="mt-3"
                  placeholder="Catatan admin (wajib untuk suspend/putus mitra)"
                  value={actionNote[m.id] ?? ""}
                  onChange={(e) =>
                    setActionNote((prev) => ({ ...prev, [m.id]: e.target.value }))
                  }
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {m.approval_status === "pending" && m.owner_id && (
                    <>
                      <Button size="sm" onClick={() => verifyMerchantAction(m.id, "approved")}>
                        Setujui
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => verifyMerchantAction(m.id, "rejected")}
                      >
                        Tolak
                      </Button>
                    </>
                  )}
                  {!m.admin_suspended ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => merchantAction(m.id, "suspend")}
                    >
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => merchantAction(m.id, "unsuspend")}>
                      Batalkan suspend
                    </Button>
                  )}
                  {isStoreOpen(m) && (
                    <Button size="sm" variant="secondary" onClick={() => merchantAction(m.id, "force_close")}>
                      Tutup paksa
                    </Button>
                  )}
                  {m.owner_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => merchantAction(m.id, "disconnect")}
                    >
                      Putus mitra
                    </Button>
                  )}
                  {m.owner_id && !m.is_active && !m.admin_suspended && m.approval_status === "approved" && (
                    <Button size="sm" onClick={() => merchantAction(m.id, "activate")}>
                      Aktifkan
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMerchant(m.id, m.name)}
                  >
                    Hapus toko
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
