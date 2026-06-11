"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";

/** Tombol batalkan pesanan di tab Pesanan admin — panggil API cancel-refund. */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const paidStatuses = ["paid", "preparing", "ready_for_pickup", "on_the_way"];
  const needsRefund = paidStatuses.includes(orderStatus);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Alasan pembatalan wajib diisi");
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/cancel-refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: trimmed }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    setBusy(false);

    if (!res.ok) {
      setError(json.error ?? "Gagal membatalkan pesanan");
      return;
    }

    setOpen(false);
    setReason("");
    if (json.message) alert(json.message);
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => setOpen(true)}
      >
        <Ban className="mr-1 h-3.5 w-3.5" />
        Batalkan
      </Button>
    );
  }

  return (
    <div className="w-64 space-y-2 rounded-xl border border-red-300 bg-red-50/60 p-3 text-left">
      <p className="text-xs font-semibold text-red-800">
        Batalkan pesanan {orderId.slice(0, 8).toUpperCase()}?
      </p>
      {needsRefund && (
        <p className="text-[11px] text-red-700">
          Pesanan sudah dibayar — refund penuh {formatIdr(total)} akan dicatat.
        </p>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan pembatalan (wajib)"
        rows={2}
        maxLength={500}
        className="w-full rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-400"
      />
      {error && <p className="text-[11px] font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1 rounded-lg"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Tutup
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 rounded-lg bg-red-600 text-white hover:bg-red-500"
          disabled={busy}
          onClick={submit}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Konfirmasi batal"
          )}
        </Button>
      </div>
    </div>
  );
}
