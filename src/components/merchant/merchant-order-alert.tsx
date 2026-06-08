"use client";

import { usePathname } from "next/navigation";
import { Bell, BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

/** Suara & banner peringatan pesanan baru — aktif di semua halaman merchant (kecuali tab Order). */
export function MerchantOrderAlert() {
  const pathname = usePathname();
  const onOrdersPage = pathname.startsWith("/merchant/orders");
  const { audioReady, flash, enableAudio } = useMerchantOrderAlertContext();

  if (onOrdersPage) {
    return !audioReady ? (
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-50 border-b border-amber-500/50 bg-amber-600/95 px-4 py-3 text-amber-50 shadow-lg md:top-14">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Volume2 className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Aktifkan suara notifikasi agar pesanan masuk tidak terlewat
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-white font-semibold text-amber-900 hover:bg-amber-50"
            onClick={() => void enableAudio()}
          >
            Aktifkan suara
          </Button>
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      {!audioReady && (
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-50 border-b border-amber-500/50 bg-amber-600/95 px-4 py-3 text-amber-50 shadow-lg md:top-14">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Volume2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                Aktifkan suara notifikasi agar pesanan masuk tidak terlewat
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-white font-semibold text-amber-900 hover:bg-amber-50"
              onClick={() => void enableAudio()}
            >
              Aktifkan suara
            </Button>
          </div>
        </div>
      )}

      {flash && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[60] flex justify-center px-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex animate-pulse items-center gap-2 rounded-2xl border border-orange-400/60 bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-orange-900/50">
            <BellRing className="h-5 w-5" />
            {flash} — segera proses!
          </div>
        </div>
      )}

      {audioReady && !flash && (
        <span className="sr-only">
          <Bell aria-hidden />
          Notifikasi suara aktif
        </span>
      )}
    </>
  );
}
