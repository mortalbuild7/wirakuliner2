"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  Shield,
  ShieldCheck,
  LogOut,
  Loader2,
  Lock,
  Gauge,
  Database,
} from "lucide-react";

type Protection = {
  id: string;
  label: string;
  detail: string;
};

type SecurityPayload = {
  session?: {
    userId: string;
    email: string | null;
    name: string | null;
    lastSignIn: string | null;
  };
  protections?: Protection[];
  rateLimits?: {
    apiPerMinute: number;
    authPer15Min: number;
    adminPerMinute: number;
    pagePerMinute: number;
  };
  error?: string;
};

export default function AdminSecurityPage() {
  const router = useRouter();
  const [data, setData] = useState<SecurityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as SecurityPayload;
      if (!res.ok) {
        setError(json.error ?? "Gagal memuat data keamanan");
        return;
      }
      setData(json);
    } catch {
      setError("Gagal memuat data keamanan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function endSession() {
    if (!confirm("Akhiri sesi admin sekarang? Anda harus login ulang.")) return;
    setEnding(true);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Gagal mengakhiri sesi");
        return;
      }
      router.replace("/login?redirect=/admin");
      router.refresh();
    } catch {
      alert("Gagal mengakhiri sesi");
    } finally {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Shield className="h-7 w-7 text-emerald-600" />
            Keamanan & Sesi
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Perlindungan anti SQL injection, flood/DDoS, dan pengelolaan sesi admin.
          </p>
        </div>
        <Button
          variant="destructive"
          className="gap-2"
          disabled={ending}
          onClick={() => void endSession()}
        >
          {ending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Akhiri Sesi
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 max-w-3xl">
          {error}
        </Alert>
      )}

      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-5 w-5 text-emerald-600" />
            Sesi aktif
          </h2>
          {data?.session ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Nama</dt>
                <dd className="font-medium">{data.session.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{data.session.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ID pengguna</dt>
                <dd className="font-mono text-xs">{data.session.userId}</dd>
              </div>
              {data.session.lastSignIn && (
                <div>
                  <dt className="text-muted-foreground">Login terakhir</dt>
                  <dd>{new Date(data.session.lastSignIn).toLocaleString("id-ID")}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Data sesi tidak tersedia.</p>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Gauge className="h-5 w-5 text-cyan-600" />
            Rate limit (anti DDoS / flood)
          </h2>
          {data?.rateLimits ? (
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">API umum</span>
                <span className="font-medium">{data.rateLimits.apiPerMinute}/menit per IP</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">API admin</span>
                <span className="font-medium">{data.rateLimits.adminPerMinute}/menit per IP</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">Login / logout</span>
                <span className="font-medium">{data.rateLimits.authPer15Min}/15 menit per IP</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted-foreground">Halaman web</span>
                <span className="font-medium">{data.rateLimits.pagePerMinute}/menit per IP</span>
              </li>
            </ul>
          ) : null}
          <p className="mt-4 text-xs text-muted-foreground">
            Permintaan berlebih mendapat respons 429 (Terlalu banyak permintaan).
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Perlindungan aktif
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {(data?.protections ?? []).map((p) => (
              <li
                key={p.id}
                className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
              >
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">{p.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.detail}</p>
                  <Badge className="mt-2 bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15">
                    Aktif
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
