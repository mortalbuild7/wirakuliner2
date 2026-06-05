"use client";

import { useEffect } from "react";

export default function DriverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[driver]", error);
  }, [error]);

  return (
    <div className="wira-mesh flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold text-white">Gagal memuat aplikasi driver</p>
      <p className="text-sm text-muted-foreground">
        {error.message || "Terjadi kesalahan di perangkat. Coba muat ulang."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950"
      >
        Muat ulang
      </button>
      <button
        type="button"
        onClick={() => {
          window.location.href = "/driver/app-entry";
        }}
        className="text-xs text-emerald-300 underline"
      >
        Hubungkan ulang akun
      </button>
    </div>
  );
}
