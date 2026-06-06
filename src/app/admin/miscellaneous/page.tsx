"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatIdr } from "@/lib/utils";
import {
  ORDER_OPS_ISSUE_LABEL,
  orderFlowSteps,
  type AdminOrderOpsRow,
  type OrderOpsIssue,
} from "@/lib/admin-order-ops";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import { channelLabel } from "@/lib/order-channel";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "active" | "issues" | "all";

export default function AdminMiscellaneousPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [orders, setOrders] = useState<AdminOrderOpsRow[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminOrderOpsRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/ops?filter=${filter}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        orders?: AdminOrderOpsRow[];
        issueCount?: number;
      };
      if (!res.ok) {
        setError(json.error ?? "Gagal memuat data");
        return;
      }
      setOrders(json.orders ?? []);
      setIssueCount(json.issueCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCancelBusy(true);
    setCancelMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${cancelTarget.id}/cancel-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setCancelMsg(json.error ?? "Gagal membatalkan");
        return;
      }
      setCancelMsg(json.message ?? "Pesanan dibatalkan");
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Miscellaneous — Operasi Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lacak pesanan dari pemesanan hingga selesai. Deteksi order tanpa driver atau toko
            tutup/nonaktif. Batalkan dengan pengembalian dana penuh bila perlu.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "active" as Filter, label: "Aktif" },
            { id: "issues" as Filter, label: `Bermasalah${issueCount ? ` (${issueCount})` : ""}` },
            { id: "all" as Filter, label: "Semua (termasuk selesai)" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              filter === f.id
                ? "bg-stone-800 text-white"
                : "border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat pesanan...
        </div>
      )}

      {error && !loading && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && orders.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Tidak ada pesanan untuk filter ini.
        </p>
      )}

      <ul className="space-y-4">
        {orders.map((o) => (
          <OrderOpsCard
            key={o.id}
            order={o}
            onCancel={() => {
              setCancelMsg(null);
              setCancelReason(
                o.issues.includes("merchant_closed")
                  ? "Toko tutup/libur — dibatalkan admin dengan refund penuh"
                  : o.issues.includes("no_driver") ||
                      o.issues.includes("stuck_ready_pickup") ||
                      o.issues.includes("driver_not_pickup")
                    ? "Masalah driver/pengambilan — dibatalkan admin dengan refund penuh"
                    : ""
              );
              setCancelTarget(o);
            }}
          />
        ))}
      </ul>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-xl">
            <h2 className="text-lg font-bold">Batalkan & refund penuh</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Order #{cancelTarget.id.slice(0, 8)} — {formatIdr(cancelTarget.total)}
            </p>
            <label className="mt-4 block text-sm font-medium">Alasan pembatalan</label>
            <Input
              className="mt-1.5"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Contoh: Toko libur, tidak ada driver..."
            />
            {cancelMsg && (
              <p className="mt-3 text-sm text-amber-700">{cancelMsg}</p>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={cancelBusy}
                onClick={() => setCancelTarget(null)}
              >
                Batal
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={cancelBusy || !cancelReason.trim()}
                onClick={() => void confirmCancel()}
              >
                {cancelBusy ? "Memproses..." : "Batalkan & refund"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function IssueBadge({ issue }: { issue: OrderOpsIssue }) {
  return (
    <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-800">
      <AlertTriangle className="mr-1 h-3 w-3" />
      {ORDER_OPS_ISSUE_LABEL[issue]}
    </Badge>
  );
}

function OrderOpsCard({
  order,
  onCancel,
}: {
  order: AdminOrderOpsRow;
  onCancel: () => void;
}) {
  const merchant = order.merchants;
  const customer = order.profiles;
  const customerName =
    customer && !Array.isArray(customer) ? customer.name : undefined;
  const steps = orderFlowSteps(order.order_status);
  const cancellable =
    order.order_status !== "delivered" && order.order_status !== "cancelled";

  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">#{order.id.slice(0, 8)}</p>
          <p className="text-sm">
            {merchant?.name ?? "Toko"} · {channelLabel(order.delivery_address)}
          </p>
          <p className="text-xs text-muted-foreground">
            Customer: {customerName ?? "—"} · {order.ageMinutes} menit lalu
          </p>
        </div>
        <div className="text-right">
          <Badge>{ORDER_STATUS_LABEL[order.order_status]}</Badge>
          <p className="mt-1 font-semibold">{formatIdr(order.total)}</p>
        </div>
      </div>

      {order.issues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.issues.map((i) => (
            <IssueBadge key={i} issue={i} />
          ))}
        </div>
      )}

      {order.order_status === "cancelled" && order.admin_cancel_reason && (
        <p className="mt-2 text-xs text-red-700">
          Dibatalkan: {order.admin_cancel_reason}
          {order.refund_amount
            ? ` · Refund ${formatIdr(Number(order.refund_amount))} (${order.refund_status})`
            : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1">
        {steps.map((s) => (
          <span
            key={s.status}
            className={cn(
              "rounded-md px-2 py-0.5 text-[10px]",
              s.active && "bg-stone-800 text-white",
              s.done && !s.active && "bg-emerald-100 text-emerald-800",
              !s.done && !s.active && "bg-muted text-muted-foreground"
            )}
          >
            {s.done && !s.active ? (
              <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
            ) : null}
            {s.label}
          </span>
        ))}
        {order.order_status === "cancelled" && (
          <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] text-red-800">
            <XCircle className="mr-0.5 inline h-3 w-3" />
            Dibatalkan
          </span>
        )}
      </div>

      <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{order.delivery_address}</p>
      <p className="text-xs text-muted-foreground">
        Driver: {order.drivers?.name ?? (order.driver_id ? "—" : "Belum ditugaskan")}
        {order.payment_gateway ? ` · Bayar: ${order.payment_gateway}` : ""}
      </p>

      {cancellable && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
          onClick={onCancel}
        >
          Batalkan & refund penuh
        </Button>
      )}
    </li>
  );
}
