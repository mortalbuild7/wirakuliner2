"use client";

import { useEffect, useRef } from "react";
import { BellRing, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

/** Banner notifikasi pesanan masuk — khusus halaman Order merchant. */
export function MerchantOrdersNotification() {
  const { audioReady, flash, flashDetail, enableAudio, dismissFlash } =
    useMerchantOrderAlertContext();
  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!flashDetail?.orderId) return;
    if (scrolledRef.current === flashDetail.orderId) return;
    scrolledRef.current = flashDetail.orderId;

    window.setTimeout(() => {
      const el = document.getElementById(`merchant-order-${flashDetail.orderId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, [flashDetail?.orderId]);

  return (
    <div className="space-y-3">
      {!audioReady && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Volume2 className="h-5 w-5 shrink-0 text-amber-300" />
              <p className="text-sm font-medium text-amber-100">
                Aktifkan suara & notifikasi agar pesanan masuk tidak terlewat
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-amber-400 font-semibold text-amber-950 hover:bg-amber-300"
              onClick={() => void enableAudio()}
            >
              Aktifkan
            </Button>
          </div>
        </div>
      )}

      {flash && flashDetail && (
        <div
          className="relative overflow-hidden rounded-2xl border border-orange-400/50 bg-gradient-to-r from-orange-600/90 to-amber-600/90 px-4 py-4 shadow-lg shadow-orange-900/30"
          role="alert"
          aria-live="assertive"
        >
          <div className="absolute inset-0 animate-pulse bg-orange-400/10" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <BellRing className="h-6 w-6 text-white" />
              </span>
              <div>
                <p className="text-base font-bold text-white">{flash}</p>
                <p className="mt-0.5 text-sm text-orange-100">
                  {flashDetail.statusLabel} — segera proses pesanan ini
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-white hover:bg-white/15"
              onClick={dismissFlash}
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
