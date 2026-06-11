"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import {
  cancelOrderEmergency,
  type CancelOrderResult,
} from "@/app/actions/orderCancelActions";

/**
 * Tombol 'Batalkan Order' (Pembatalan Darurat) di baris tabel pesanan admin.
 *
 * - Modal konfirmasi WAJIB diisi alasan sebelum Server Action ditembak —
 *   mencegah pembatalan finansial karena salah klik (fat-finger).
 * - useTransition + guard `pending` → tombol terkunci selama aksi berjalan,
 *   mencegah double-submit dari sisi client (lapisan pertama anti-race;
 *   lapisan finalnya FOR UPDATE di PostgreSQL).
 */
export function CancelOrderButton({
  orderId,
  orderStatus,
  total,
}: {
  orderId: string;
  orderStatus: string;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const paidStatuses = ["paid", "preparing", "ready_for_pickup", "on_the_way"];
  const needsRefund = paidStatuses.includes(orderStatus);

  function submit() {
    // Validasi ringan di client untuk UX; validasi otoritatif tetap di
    // Server Action (zod) dan di SQL — client tidak pernah dipercaya.
    if (reason.trim().length < 5) {
      setError("Alasan pembatalan minimal 5 karakter");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res: CancelOrderResult = await cancelOrderEmergency({
        orderId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      alert(res.message);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-red-300 bg-red-600 text-white hover:bg-red-500 hover:text-white"
        onClick={() => setOpen(true)}
      >
        <Ban className="mr-1 h-3.5 w-3.5" />
        Batalkan Order
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Pembatalan Darurat
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Order{" "}
                  <span className="font-mono font-semibold">
                    {orderId.slice(0, 8).toUpperCase()}
                  </span>{" "}
                  akan dibatalkan permanen.
                </p>
              </div>
            </div>

            {needsRefund && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Pesanan sudah dibayar — refund penuh{" "}
                <strong>{formatIdr(total)}</strong> akan diproses otomatis
                (wallet) atau ditandai untuk refund manual (Midtrans). Driver
                yang bertugas dilepas kembali ke status tersedia.
              </p>
            )}

            <label className="mt-4 block text-xs font-medium text-slate-700">
              Alasan pembatalan (wajib, min. 5 karakter)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: merchant tutup mendadak, customer minta batal..."
              rows={3}
              maxLength={500}
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
            />

            {error && (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-xl"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                Tutup
              </Button>
              <Button
                type="button"
                className="h-10 flex-1 rounded-xl bg-red-600 font-semibold text-white hover:bg-red-500"
                disabled={pending || reason.trim().length < 5}
                onClick={submit}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Konfirmasi Batalkan"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
