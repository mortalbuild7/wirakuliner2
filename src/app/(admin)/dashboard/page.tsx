"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  checkRegionalSeedStatus,
  runRegionalMigrationSeed,
  type RegionalSeedStatus,
} from "@/app/actions/seedActions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Database, Loader2, MapPin } from "lucide-react";

/**
 * Dashboard admin sementara (Client Component) — URL: /dashboard
 *
 * Bypass otomatis: banner kuning + tombol seed memanggil
 * `runRegionalMigrationSeed()` via service role, lalu `window.location.reload()`
 * agar dropdown provinsi/kota langsung terbaca tanpa cache stale.
 */
export default function AdminDashboardClientPage() {
  const [status, setStatus] = useState<RegionalSeedStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [pending, startTransition] = useTransition();

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    setLoadError(null);
    try {
      const res = await checkRegionalSeedStatus();
      setStatus(res);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Gagal memeriksa status basis data"
      );
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  function handleSeed() {
    setSeedError(null);
    startTransition(async () => {
      const res = await runRegionalMigrationSeed();
      if (!res.ok) {
        setSeedError(res.error);
        return;
      }
      // Reload penuh — memastikan semua Server Component membaca data baru.
      window.location.reload();
    });
  }

  const bannerVisible =
    !checking && status?.needsSeed && status.isSuperAdmin;

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapPin className="h-7 w-7 text-sky-600" />
          Dashboard Admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Panel kontrol WIRA — bypass migrasi regional tersedia di bawah.
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {checking && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memeriksa basis data regional...
        </div>
      )}

      {/* Banner kuning — tampil jika provinsi/kota/zona layanan belum lengkap */}
      {bannerVisible && (
        <div className="mb-6 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm">
          <div className="flex flex-wrap items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Basis Data Regional Belum Lengkap</p>
              <p className="mt-1 text-sm text-amber-900/90">
                Tabel provinsi, kota, atau zona layanan masih kosong / kurang.
                Jalankan migrasi sekali untuk mengisi 4 provinsi dan 6 kota
                layanan (service role bypass RLS).
              </p>
              {status && (
                <p className="mt-2 font-mono text-xs text-amber-800">
                  Saat ini: {status.counts.provinces} provinsi ·{" "}
                  {status.counts.cities} kota · {status.counts.serviceCities}{" "}
                  zona layanan
                </p>
              )}
              {seedError && (
                <p className="mt-2 text-sm font-medium text-red-700">
                  {seedError}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-3 border-amber-500 bg-white text-amber-900 hover:bg-amber-100"
                disabled={pending}
                onClick={handleSeed}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                Jalankan Migrasi Regional Admin Sekarang
              </Button>
            </div>
          </div>
        </div>
      )}

      {!checking && status && !status.isSuperAdmin && status.needsSeed && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Basis data regional belum lengkap. Hubungi <strong>SUPER_ADMIN</strong>{" "}
          untuk menjalankan migrasi.
        </div>
      )}

      {!checking && status && !status.needsSeed && (
        <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Basis data regional siap — {status.counts.provinces} provinsi,{" "}
          {status.counts.cities} kota, {status.counts.serviceCities} zona layanan
          aktif.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="default">
          <Link href="/admin">Buka Dashboard Utama</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/dashboard/cities">Manajemen Kota</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/drivers/new">Daftarkan Driver</Link>
        </Button>
      </div>

      {/* Fallback manual seed untuk SUPER_ADMIN jika deteksi status gagal */}
      {!checking && status?.isSuperAdmin && loadError && (
        <div className="mt-6 rounded-lg border border-dashed border-amber-400 p-4">
          <p className="text-sm text-muted-foreground">
            Deteksi otomatis gagal — jalankan migrasi manual:
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={pending}
            onClick={handleSeed}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Jalankan Migrasi Regional Admin Sekarang
          </Button>
        </div>
      )}
    </main>
  );
}
