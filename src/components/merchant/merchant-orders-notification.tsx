"use client";

import { useEffect, useRef } from "react";
import { BellRing, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

/** Banner notifikasi pesanan masuk — halaman Order merchant, kontras tinggi. */
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
        <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Volume2 className="h-5 w-5 shrink-0 text-amber-800" />
              <p className="text-sm font-bold text-amber-950">
                Aktifkan suara & notifikasi agar pesanan masuk tidak terlewat
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 rounded-2xl bg-amber-800 font-bold text-white hover:bg-amber-900"
              onClick={() => void enableAudio()}
            >
              Aktifkan
            </Button>
          </div>
        </div>
      )}

      {flash && flashDetail && (
        <div
          className="merchant-new-order-alert relative overflow-hidden"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-200">
                <BellRing className="h-6 w-6 text-amber-950" />
              </span>
              <div>
                <p className="text-base font-bold text-amber-950">{flash}</p>
                <p className="mt-0.5 text-sm font-semibold text-amber-900">
                  {flashDetail.statusLabel} — segera proses pesanan ini
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 rounded-2xl text-amber-950 hover:bg-amber-200/80"
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
