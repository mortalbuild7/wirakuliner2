"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";

function BannerInner() {
  const params = useSearchParams();
  const notice = params.get("notice");
  const error = params.get("error");
  const need = params.get("need") ?? "merchant";

  if (notice === "account-restricted") {
    const status = params.get("status") ?? "suspended";
    return (
      <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
        <strong>Akses akun dibatasi</strong>
        <p className="mt-2 text-sm">
          Akun Anda {status === "blocked" ? "diblokir" : "disuspend"} oleh admin.
          Hubungi operator WIRA Kuliner jika ini kesalahan.
        </p>
      </Alert>
    );
  }

  if (notice === "merchant-suspended") {
    return (
      <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
        <strong>Toko disuspend admin</strong>
        <p className="mt-2 text-sm">
          Akses panel merchant tidak tersedia. Hubungi admin WIRA Kuliner.
        </p>
      </Alert>
    );
  }

  if (notice === "driver-closed") {
    return (
      <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
        <strong>Aplikasi driver sementara ditutup</strong>
        <p className="mt-2 text-sm">
          Akses driver tidak tersedia untuk sementara. Customer dan merchant tetap berjalan normal.
        </p>
      </Alert>
    );
  }

  if (error === "unauthorized") {
    if (need === "merchant") {
      return (
        <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
          <strong>Pendaftaran / akses toko (Merchant)</strong>
          <p className="mt-2">
            Bukan Panel Admin. Untuk mendaftarkan toko:{" "}
            <Link href="/register?role=merchant" className="font-medium underline">
              Daftar merchant
            </Link>
            {" · "}
            <Link href="/login?redirect=/merchant/setup" className="font-medium underline">
              Masuk
            </Link>
            {" · "}
            <Link href="/merchant/setup" className="font-medium underline">
              Lengkapi data toko
            </Link>
          </p>
        </Alert>
      );
    }

    if (need === "admin") {
      return (
        <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
          Akses Panel Admin ditolak. Hanya akun dengan peran <strong>admin</strong>.{" "}
          <Link href="/login?redirect=/admin" className="underline">
            Masuk admin
          </Link>
        </Alert>
      );
    }

    return (
      <Alert variant="warning" className="mx-auto mt-4 max-w-5xl">
        Akses ditolak.{" "}
        <Link href="/login" className="underline">
          Masuk
        </Link>{" "}
        dengan peran yang sesuai.
      </Alert>
    );
  }

  return null;
}

export function HomeAccessBanner() {
  return (
    <Suspense fallback={null}>
      <BannerInner />
    </Suspense>
  );
}
