"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";

function BannerInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const need = params.get("need") ?? "merchant";

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
