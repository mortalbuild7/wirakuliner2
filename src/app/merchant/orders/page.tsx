"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIdr } from "@/lib/utils";
import { ThermalReceipt } from "@/components/merchant/thermal-receipt";
import { ReceiptShareStubs } from "@/components/merchant/receipt-share-stubs";
import { channelLabel, isNgojekOrder, isOnsiteOrder } from "@/lib/order-channel";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import type { Order, OrderItem } from "@/types/database";
import { pickOrderCustomer } from "@/lib/order-customer";
import { cn } from "@/lib/utils";
import { printThermalReceipt } from "@/lib/print";
import { MerchantOrdersNotification } from "@/components/merchant/merchant-orders-notification";
import { useMerchantOrderAlertContext } from "@/contexts/merchant-order-alert-context";

type Tab = "onsite" | "delivery";

const ACTIVE_ORDER_STATUSES: Order["order_status"][] = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
];

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<
    (Order & {
      order_items?: OrderItem[];
      profiles?: { name: string; phone: string | null } | { name: string; phone: string | null }[];
    })[]
  >([]);
  const [tab, setTab] = useState<Tab>("onsite");
  const [printOrder, setPrintOrder] = useState<(Order & { order_items?: OrderItem[] }) | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const merchantIdRef = useRef<string | null>(null);
  const initialTabSet = useRef(false);
  const supabase = createClient();
  const { flashDetail } = useMerchantOrderAlertContext();

  const load = async () => {
    const res = await fetch("/api/merchant/orders", { credentials: "include" });
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as {
      merchantId?: string;
      merchantName?: string;
      orders?: typeof orders;
    };
    if (!json.merchantId) return;
    merchantIdRef.current = json.merchantId;
    setMerchantName(json.merchantName ?? "");
    const rows = json.orders ?? [];
    setOrders(rows);

    if (!initialTabSet.current) {
      const hasDelivery = rows.some(
        (o) =>
          !isOnsiteOrder(o.delivery_address) &&
          !isNgojekOrder(o.delivery_address) &&
          ACTIVE_ORDER_STATUSES.includes(o.order_status)
      );
      if (hasDelivery) setTab("delivery");
      initialTabSet.current = true;
    }
  };

  useEffect(() => {
    load();

    const ch = supabase
      .channel("merchant-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as
          | { merchant_id?: string; delivery_address?: string; order_status?: string }
          | undefined;
        if (merchantIdRef.current && row?.merchant_id === merchantIdRef.current) {
          if (
            row.delivery_address &&
            !isOnsiteOrder(row.delivery_address) &&
            !isNgojekOrder(row.delivery_address) &&
            row.order_status &&
            ACTIVE_ORDER_STATUSES.includes(row.order_status as Order["order_status"])
          ) {
            setTab("delivery");
          }
          load();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const onsite = isOnsiteOrder(o.delivery_address);
      return tab === "onsite" ? onsite : !onsite;
    });
  }, [orders, tab]);

  const tabCounts = useMemo(() => {
    let onsite = 0;
    let delivery = 0;
    for (const o of orders) {
      if (!ACTIVE_ORDER_STATUSES.includes(o.order_status)) continue;
      if (isOnsiteOrder(o.delivery_address)) onsite += 1;
      else delivery += 1;
    }
    return { onsite, delivery };
  }, [orders]);

  async function patchOrder(id: string, action: "start_preparing" | "mark_ready") {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/merchant/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(json.error ?? "Gagal memperbarui pesanan");
        return;
      }
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function acceptOrder(id: string) {
    await patchOrder(id, "start_preparing");
  }

  async function markPrepared(id: string) {
    await patchOrder(id, "mark_ready");
  }

  async function confirmOnsitePayment(id: string) {
    const res = await fetch("/api/merchant/pos/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: id }),
    });
    const json = await res.json();
    if (!res.ok) alert(json.error ?? "Gagal");
    else load();
  }

  return (
    <main className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">Pesanan Masuk</h1>
      <p className="text-sm text-muted-foreground">Realtime — antar & di tempat</p>

      <div className="mt-4">
        <MerchantOrdersNotification />
      </div>

      <div className="mt-4 flex gap-2 rounded-2xl border border-white/10 p-1">
        {(["onsite", "delivery"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-medium transition",
              tab === t
                ? "bg-orange-500/25 text-orange-200"
                : "text-muted-foreground hover:text-white"
            )}
          >
            {t === "onsite" ? "Di tempat" : "Antar"}
            {tabCounts[t] > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                {tabCounts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {filtered.map((o) => {
          const onsite = isOnsiteOrder(o.delivery_address);
          const customer = pickOrderCustomer(o.profiles);
          return (
            <div
              key={o.id}
              id={`merchant-order-${o.id}`}
              className={cn(
                "glass-card p-4 transition",
                flashDetail?.orderId === o.id &&
                  "ring-2 ring-orange-400 shadow-lg shadow-orange-500/20"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm">#{o.id.slice(0, 8)}</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-white/20 text-xs">
                    {channelLabel(o.delivery_address)}
                  </Badge>
                  <Badge>{ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}</Badge>
                </div>
              </div>
              {customer && (
                <p className="mt-1 text-sm font-semibold text-orange-200">
                  Customer: {customer.name}
                  {customer.phone ? (
                    <span className="ml-2 font-normal text-muted-foreground">{customer.phone}</span>
                  ) : null}
                </p>
              )}
              <p className="text-sm">{o.delivery_address}</p>
              <p className="font-semibold">
                {formatIdr(Number(o.total_product_amount) + Number(o.delivery_fee))}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onsite && o.order_status === "pending_payment" && (
                  <Button size="sm" onClick={() => confirmOnsitePayment(o.id)}>
                    Konfirmasi bayar
                  </Button>
                )}
                {o.order_status === "paid" && (
                  <Button
                    size="sm"
                    disabled={actionBusy === o.id}
                    onClick={() => acceptOrder(o.id)}
                  >
                    {actionBusy === o.id ? "Memproses..." : "Mulai siapkan"}
                  </Button>
                )}
                {o.order_status === "preparing" && (
                  <Button
                    size="sm"
                    disabled={actionBusy === o.id}
                    onClick={() => markPrepared(o.id)}
                  >
                    {actionBusy === o.id
                      ? "Memproses..."
                      : onsite
                        ? "Selesai"
                        : "Siap diambil driver"}
                  </Button>
                )}
                {!onsite && o.order_status === "ready_for_pickup" && (
                  <Badge className="self-center">Menunggu driver ambil</Badge>
                )}
                {!onsite && o.order_status === "on_the_way" && (
                  <Badge className="self-center">Driver mengantar</Badge>
                )}
                {(o.order_status === "paid" || o.order_status === "preparing" || o.order_status === "delivered") && (
                  <Button size="sm" variant="outline" onClick={() => setPrintOrder(o)}>
                    Struk
                  </Button>
                )}
                <ReceiptShareStubs orderId={o.id} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Belum ada pesanan {tab === "onsite" ? "di tempat" : "antar"}
          </p>
        )}
      </div>
      {printOrder && printOrder.order_items && (
        <div className="thermal-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] overflow-auto rounded-lg bg-white">
            <ThermalReceipt
              order={printOrder}
              items={printOrder.order_items}
              merchantName={merchantName}
            />
            <div className="flex gap-2 p-4 print:hidden">
              <Button onClick={() => printThermalReceipt()}>Cetak struk thermal</Button>
              <Button variant="outline" onClick={() => setPrintOrder(null)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
