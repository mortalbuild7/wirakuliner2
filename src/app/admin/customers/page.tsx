"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import type { AccountStatus, Profile } from "@/types/database";
import { ACCOUNT_STATUS_LABEL } from "@/lib/account-status";
import { Loader2, Users } from "lucide-react";

type CustomerRow = Pick<
  Profile,
  "id" | "name" | "email" | "phone" | "account_status" | "admin_note" | "warned_at" | "suspended_until" | "created_at"
>;

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [suspendDays, setSuspendDays] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const supabase = createClient();

  const load = useCallback(async () => {
    setListLoading(true);
    const { data, error: loadErr } = await supabase
      .from("profiles")
      .select(
        "id, name, email, phone, account_status, admin_note, warned_at, suspended_until, created_at"
      )
      .eq("role", "customer")
      .order("created_at", { ascending: false });

    if (loadErr) {
      setError(loadErr.message);
    } else {
      setCustomers((data as CustomerRow[]) ?? []);
    }
    setListLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function customerAction(
    id: string,
    action: "warn" | "suspend" | "block" | "restore"
  ) {
    const note = notes[id]?.trim();
    if (action !== "restore" && !note) {
      alert("Isi catatan / alasan moderasi");
      return;
    }

    const labels: Record<string, string> = {
      warn: "beri peringatan",
      suspend: "suspend customer",
      block: "blokir permanen",
      restore: "pulihkan akun",
    };

    if (!confirm(`Yakin ${labels[action]}?`)) return;

    setError(null);
    const body: { action: string; note?: string; suspended_days?: number } = { action, note };
    if (action === "suspend") {
      body.suspended_days = Number(suspendDays[id] || "7");
    }

    const res = await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const resBody = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(resBody.error ?? "Gagal memproses aksi");
      return;
    }
    setSuccess(`Aksi "${action}" berhasil`);
    load();
  }

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    );
  });

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-7 w-7 text-cyan-600" />
          Kelola Customer
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Beri peringatan, suspend sementara, atau blokir customer yang melanggar ketentuan.
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

      <div className="mb-4 max-w-md">
        <Label>Cari nama / email / telepon</Label>
        <Input
          className="mt-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ketik untuk filter..."
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold">
          Daftar customer ({filtered.length}
          {search ? ` dari ${customers.length}` : ""})
        </h2>
        {listLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Tidak ada customer.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {filtered.map((c) => {
              const status = (c.account_status ?? "active") as AccountStatus;
              return (
                <li key={c.id} className="rounded-lg border bg-card p-4 text-sm">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-muted-foreground">
                      {c.email ?? "—"}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      Status:{" "}
                      <span
                        className={
                          status === "blocked"
                            ? "font-medium text-red-600"
                            : status === "suspended"
                              ? "font-medium text-amber-600"
                              : status === "warned"
                                ? "font-medium text-yellow-600"
                                : "text-emerald-600"
                        }
                      >
                        {ACCOUNT_STATUS_LABEL[status]}
                      </span>
                      {c.suspended_until && status === "suspended" && (
                        <span className="text-muted-foreground">
                          {" "}
                          — sampai {new Date(c.suspended_until).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </p>
                    {c.admin_note && (
                      <p className="mt-1 text-xs italic text-amber-700">Catatan: {c.admin_note}</p>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Catatan / alasan moderasi"
                      value={notes[c.id] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    />
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      placeholder="Hari suspend (default 7)"
                      value={suspendDays[c.id] ?? ""}
                      onChange={(e) =>
                        setSuspendDays((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {status !== "warned" && status !== "blocked" && status !== "suspended" && (
                      <Button size="sm" variant="secondary" onClick={() => customerAction(c.id, "warn")}>
                        Peringatan
                      </Button>
                    )}
                    {status !== "blocked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => customerAction(c.id, "suspend")}
                      >
                        Suspend
                      </Button>
                    )}
                    {status !== "blocked" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => customerAction(c.id, "block")}
                      >
                        Blokir
                      </Button>
                    )}
                    {status !== "active" && (
                      <Button size="sm" onClick={() => customerAction(c.id, "restore")}>
                        Pulihkan
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
