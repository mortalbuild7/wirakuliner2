"use client";

import { usePathname } from "next/navigation";
import { Bell, BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

/** Suara & banner peringatan pesanan baru — kontras tinggi amber-100 / amber-950. */
export function MerchantOrderAlert() {
  const pathname = usePathname();
  const onOrdersPage = pathname.startsWith("/merchant/orders");
  const { audioReady, flash, enableAudio } = useMerchantOrderAlertContext();

  const audioBanner = !audioReady ? (
    <div className="sticky top-[calc(env(safe-area-inset-top,0px)+3.25rem)] z-50 border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 shadow-md md:top-14">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Volume2 className="h-5 w-5 shrink-0 text-amber-800" />
          <p className="text-sm font-bold">
            Aktifkan suara notifikasi agar pesanan masuk tidak terlewat
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 rounded-2xl bg-amber-800 font-bold text-white hover:bg-amber-900"
          onClick={() => void enableAudio()}
        >
          Aktifkan suara
        </Button>
      </div>
    </div>
  ) : null;

  if (onOrdersPage) {
    return audioBanner;
  }

  return (
    <>
      {audioBanner}

      {flash && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[60] flex justify-center px-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="merchant-new-order-alert flex items-center gap-2 px-5 py-3 text-sm font-bold">
            <BellRing className="h-5 w-5 text-amber-900" />
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
