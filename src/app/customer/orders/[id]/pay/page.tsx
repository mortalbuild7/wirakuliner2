"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  QrisPaymentPanel,
  type QrisPaymentData,
} from "@/components/payment/qris-payment-panel";
import {
  channelLabelFromRecord,
  parseTransitLegs,
} from "@/lib/order-channel";
import {
  clearActiveTransitOrderHint,
  persistActiveTransitOrderHint,
  syncActiveTransitOrderFromOrder,
} from "@/lib/customer-active-order";
import { createQrisPayment } from "@/lib/payment-flow";
import { formatIdr } from "@/lib/utils";
import type { Order } from "@/types/database";

export default function CustomerOrderPayPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [qrisPayment, setQrisPayment] = useState<QrisPaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        order?: Order;
        error?: string;
      };

      if (!res.ok || !json.order) {
        setError(json.error ?? "Pesanan tidak ditemukan");
        setOrder(null);
        return;
      }

      const next = json.order;
      if (next.order_status !== "pending_payment") {
        router.replace(`/customer/orders/${orderId}`);
        return;
      }

      setOrder(next);
      syncActiveTransitOrderFromOrder(next);
    } catch {
      setError("Gagal memuat pesanan");
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const startPayment = useCallback(async () => {
    if (!order) return;
    setPayLoading(true);
    setError(null);
    try {
      const amount =
        Number(order.total_product_amount ?? 0) + Number(order.delivery_fee ?? 0);
      const qris = await createQrisPayment({
        type: "ngojek",
        amount,
        orderId: order.id,
      });
      setQrisPayment(qris);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat pembayaran");
    } finally {
      setPayLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (order && !qrisPayment && !payLoading && !loading) {
      void startPayment();
    }
  }, [order, qrisPayment, payLoading, loading, startPayment]);

  const handlePaid = useCallback(() => {
    if (!order) return;
    persistActiveTransitOrderHint({
      id: order.id,
      order_status: "paid",
      delivery_address: order.delivery_address,
      service_type: order.service_type,
      driver_id: order.driver_id,
      updated_at: new Date().toISOString(),
    });
    router.push(`/customer/orders/${orderId}`);
  }, [order, orderId, router]);

  const handleCancelOrder = useCallback(async () => {
    if (!order || cancelLoading) return;
    const ok = window.confirm(
      "Batalkan pesanan ini? Anda bisa memesan ulang kapan saja."
    );
    if (!ok) return;

    setCancelLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer/orders/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Gagal membatalkan pesanan");
        return;
      }
      clearActiveTransitOrderHint(orderId);
      router.push("/customer");
    } catch {
      setError("Gagal membatalkan pesanan");
    } finally {
      setCancelLoading(false);
    }
  }, [order, orderId, cancelLoading, router]);

  if (loading) {
    return (
      <main className="mx-auto flex max-w-lg items-center justify-center px-4 py-16 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 text-slate-900">
        <h1 className="text-xl font-bold">Pembayaran Pesanan</h1>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Link href="/customer">
          <Button variant="outline" className="w-full">
            Kembali ke beranda
          </Button>
        </Link>
      </main>
    );
  }

  const channel = channelLabelFromRecord(order);
  const legs = parseTransitLegs(order.delivery_address);
  const routeHint =
    legs?.pickup && legs?.destination
      ? `${legs.pickup} → ${legs.destination}`
      : order.delivery_address;
  const total =
    Number(order.total_product_amount ?? 0) + Number(order.delivery_fee ?? 0);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-4 text-slate-900">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Selesaikan Pembayaran</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pesanan Anda menunggu pembayaran sebelum dicarikan driver.
        </p>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
          Menunggu pembayaran
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">{channel}</p>
        <p className="mt-1 text-xs text-slate-600">{routeHint}</p>
        <p className="mt-3 text-lg font-bold text-slate-900">{formatIdr(total)}</p>
      </section>

      {error && <Alert variant="destructive">{error}</Alert>}

      {payLoading && !qrisPayment ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Menyiapkan pembayaran...
        </div>
      ) : null}

      {qrisPayment ? (
        <QrisPaymentPanel
          data={qrisPayment}
          title={`Scan QRIS — pembayaran ${channel}`}
          onPaid={handlePaid}
          onCancel={() => setQrisPayment(null)}
        />
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
        disabled={cancelLoading}
        onClick={() => void handleCancelOrder()}
      >
        {cancelLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Membatalkan...
          </>
        ) : (
          "Batalkan pesanan"
        )}
      </Button>

      <Link href="/customer">
        <Button variant="ghost" className="w-full text-slate-600">
          Kembali ke beranda
        </Button>
      </Link>
    </main>
  );
}
