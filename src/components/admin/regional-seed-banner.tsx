"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runRegionalMigrationSeed } from "@/app/actions/seedActions";
import { AlertTriangle, Database, Loader2 } from "lucide-react";

/**
 * Banner peringatan kuning — muncul di dashboard SUPER_ADMIN ketika
 * tabel `provinces` / `cities` masih kosong.
 *
 * Tombol memanggil `runRegionalMigrationSeed()` lalu `router.refresh()`
 * agar banner hilang otomatis setelah seed sukses.
 */
export function RegionalSeedBanner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSeed() {
    setError(null);
    startTransition(async () => {
      const res = await runRegionalMigrationSeed();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Refresh Server Component — banner hilang jika tabel sudah terisi.
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Basis Data Regional Belum Terisi</p>
          <p className="mt-1 text-sm text-amber-900/90">
            Tabel provinsi atau kota masih kosong. Form Manajemen Kota dan
            pendaftaran driver membutuhkan data awal ini agar dropdown wilayah
            dapat digunakan.
          </p>
          {error && (
            <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
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
            Jalankan Migrasi Basis Data Sekarang
          </Button>
        </div>
      </div>
    </div>
  );
}
