"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";

export type QrisPaymentData = {
  midtransOrderId: string;
  grossAmount: number;
  mode?: "qris" | "snap";
  qris?: {
    qrString: string | null;
    qrUrl: string | null;
    acquirer?: string | null;
  };
  snap?: {
    token: string;
    redirectUrl: string;
  };
  message?: string;
  orderId?: string | null;
};

type Props = {
  data: QrisPaymentData;
  title?: string;
  onPaid: () => void;
  onCancel?: () => void;
};

export function QrisPaymentPanel({
  data,
  title,
  onPaid,
  onCancel,
}: Props) {
  const isSnapMode = data.mode === "snap" && Boolean(data.snap?.redirectUrl);
  const panelTitle =
    title ?? (isSnapMode ? "Lanjutkan pembayaran" : "Scan QRIS untuk bayar");
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    const params = new URLSearchParams({
      midtransOrderId: data.midtransOrderId,
    });
    if (data.orderId) params.set("orderId", data.orderId);

    const res = await fetch(`/api/payment/status?${params}`, {
      credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as {
      paid?: boolean;
      error?: string;
    };
    if (!res.ok) {
      setError(json.error ?? "Gagal cek status pembayaran");
      return false;
    }
    if (json.paid) {
      setPolling(false);
      onPaid();
      return true;
    }
    return false;
  }, [data.midtransOrderId, data.orderId, onPaid]);

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      void checkStatus();
    }, 4000);
    void checkStatus();
    return () => window.clearInterval(id);
  }, [polling, checkStatus]);

  const isSnap = data.mode === "snap" && data.snap?.redirectUrl;

  useEffect(() => {
    if (!isSnap || !data.snap?.redirectUrl) return;
    const opened = window.open(
      data.snap.redirectUrl,
      "_blank",
      "noopener,noreferrer"
    );
    if (!opened) {
      setError("Izinkan pop-up browser, lalu ketuk tombol bayar di bawah.");
    }
  }, [isSnap, data.snap?.redirectUrl]);
  const qrImageSrc =
    !isSnap && data.qris?.qrUrl
      ? data.qris.qrUrl
      : !isSnap && data.qris?.qrString
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qris.qrString)}`
        : null;

  return (
    <div className="glass-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-cyan-400" />
        <div>
          <p className="text-sm font-semibold text-white">{panelTitle}</p>
          <p className="text-xs text-muted-foreground">
            {formatIdr(data.grossAmount)}
            {!isSnap && data.qris?.acquirer ? ` · ${data.qris.acquirer}` : ""}
          </p>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {isSnap ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            Halaman pembayaran Midtrans terbuka di tab baru. Pilih QRIS, GoPay,
            atau metode lain. Setelah bayar, status diperbarui otomatis di sini.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              window.open(data.snap!.redirectUrl, "_blank", "noopener,noreferrer");
            }}
          >
            Buka halaman pembayaran
          </Button>
        </div>
      ) : qrImageSrc ? (
        <div className="flex justify-center rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageSrc}
            alt="QRIS pembayaran"
            width={240}
            height={240}
            className="h-60 w-60 object-contain"
          />
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          QRIS tidak tersedia. Coba buat ulang pembayaran.
        </p>
      )}

      {!isSnap && (
        <p className="text-center text-xs text-muted-foreground">
          Buka aplikasi e-wallet / m-banking, pilih Scan QRIS, lalu bayar. Status
          diperbarui otomatis setelah pembayaran berhasil.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={!polling}
          onClick={() => void checkStatus()}
        >
          {polling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Menunggu bayar...
            </>
          ) : (
            "Selesai"
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </div>
  );
}
