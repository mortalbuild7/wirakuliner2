"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";
import {
  CUSTOMER_ACTIVE_ORDER_STATUSES,
  customerActiveOrderHref,
} from "@/lib/customer-active-order";
import { useCustomerOrdersMonitor } from "@/contexts/customer-orders-monitor-context";
import { CustomerActiveChatsHub } from "@/components/customer/customer-active-chats-hub";
import { CustomerActiveOrdersPanel } from "@/components/customer/customer-active-orders-panel";
import type { Order, OrderStatus } from "@/types/database";
import { Package, ChevronRight } from "lucide-react";
import { customerTrackerStatusLabel, channelLabelFromRecord } from "@/lib/order-channel";

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const { activeOrders, chatUnreadByOrder } = useCustomerOrdersMonitor();

  const activeIds = useMemo(() => new Set(activeOrders.map((o) => o.id)), [activeOrders]);

  useEffect(() => {
    const load = () => {
      fetch("/api/customer/orders", { credentials: "include" })
        .then(async (res) => {
          if (!res.ok) return;
          const json = (await res.json()) as { orders?: Order[] };
          setOrders(json.orders ?? []);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const historyOrders = orders.filter((o) => !activeIds.has(o.id));

  return (
    <main className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pesanan Saya</h1>
        <p className="text-sm text-slate-600">Pantau semua layanan yang sedang berjalan</p>
      </div>

      {activeOrders.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-emerald-800">Sedang berjalan ({activeOrders.length})</h2>
          <CustomerActiveOrdersPanel />
          <CustomerActiveChatsHub />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-700">Riwayat</h2>
        <ul className="space-y-3">
          {historyOrders.map((o) => {
            const unread = chatUnreadByOrder[o.id] ?? 0;
            const isActive = CUSTOMER_ACTIVE_ORDER_STATUSES.includes(
              o.order_status as OrderStatus
            );
            return (
              <li key={o.id}>
                <Link
                  href={
                    isActive
                      ? customerActiveOrderHref(o)
                      : `/customer/orders/${o.id}`
                  }
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                        <Package className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">
                          {channelLabelFromRecord(o)} —{" "}
                          {merchantNameFromJoin(
                            (o as Order & { merchants?: { name: string } | { name: string }[] })
                              .merchants,
                            "Toko"
                          )}
                        </span>
                        <p className="line-clamp-1 text-xs text-slate-500">{o.delivery_address}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {unread > 0 ? (
                        <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          {unread}
                        </span>
                      ) : null}
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="secondary" className="border-0 bg-slate-100 text-xs text-slate-700">
                      {isActive
                        ? customerTrackerStatusLabel({
                            delivery_address: o.delivery_address,
                            service_type: o.service_type,
                            order_status: o.order_status,
                            driver_id: o.driver_id,
                          })
                        : o.order_status}
                    </Badge>
                    <p className="font-semibold text-emerald-700">
                      {formatIdr(Number(o.total_product_amount) + Number(o.delivery_fee))}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {historyOrders.length === 0 && activeOrders.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Belum ada pesanan</p>
        ) : null}
      </section>
    </main>
  );
}
