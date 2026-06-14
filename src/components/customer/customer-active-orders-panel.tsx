"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bike, Car, ChevronRight, MessageCircle, Package, UtensilsCrossed } from "lucide-react";
import { useCustomerOrdersMonitor } from "@/contexts/customer-orders-monitor-context";
import { customerActiveOrderHref } from "@/lib/customer-active-order";
import { isOrderChatOpen } from "@/lib/order-chat";
import { isTransitOrderRecord } from "@/lib/order-channel";
import { parseTransitLegs } from "@/lib/order-channel";
import type { ServiceType } from "@/types/database";
import { cn } from "@/lib/utils";

function serviceIcon(order: {
  service_type?: ServiceType | null;
  delivery_address: string;
  merchant_name?: string | null;
}) {
  if (order.service_type === "NGOMOBIL") return Car;
  if (order.service_type === "PAKET") return Package;
  if (isTransitOrderRecord(order)) return Bike;
  return UtensilsCrossed;
}

function routeHint(order: { delivery_address: string; merchant_name?: string | null }) {
  const legs = parseTransitLegs(order.delivery_address);
  if (legs?.pickup && legs?.destination) {
    return `${legs.pickup} → ${legs.destination}`;
  }
  if (order.merchant_name) return order.merchant_name;
  return order.delivery_address;
}

type Variant = "full" | "compact";

/**
 * Panel semua pesanan aktif — 1–3 layanan sekaligus.
 */
export function CustomerActiveOrdersPanel({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: Variant;
}) {
  const pathname = usePathname();
  const { activeOrders, loading, chatUnreadByOrder } = useCustomerOrdersMonitor();

  const onTracker =
    pathname?.startsWith("/customer/orders/") &&
    !pathname.endsWith("/chat") &&
    pathname !== "/customer/orders";

  if (loading || activeOrders.length === 0 || (variant === "compact" && onTracker)) {
    return null;
  }

  if (variant === "compact") {
    return (
      <div className={cn("border-b border-emerald-100 bg-emerald-50/80 px-4 py-2", className)}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
          {activeOrders.length} pesanan berjalan
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeOrders.map((order) => {
            const Icon = serviceIcon(order);
            const unread = chatUnreadByOrder[order.id] ?? 0;
            const href = customerActiveOrderHref(order);
            return (
              <Link
                key={order.id}
                href={href}
                className="flex min-w-[10.5rem] shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm"
              >
                <Icon className="h-4 w-4 shrink-0 text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{order.channel_label}</p>
                  <p className="truncate text-[10px] text-slate-500">{order.status_label}</p>
                </div>
                {unread > 0 ? (
                  <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {activeOrders.length > 1 ? (
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
          {activeOrders.length} pesanan berjalan
        </p>
      ) : null}
      {activeOrders.map((order) => {
        const Icon = serviceIcon(order);
        const isPendingPayment = order.order_status === "pending_payment";
        const href = customerActiveOrderHref(order);
        const unread = chatUnreadByOrder[order.id] ?? 0;
        const chatHref = `/customer/orders/${order.id}/chat`;
        const chatOpen = isOrderChatOpen(order);

        return (
          <div
            key={order.id}
            className={cn(
              "rounded-2xl border p-4 shadow-sm",
              isPendingPayment
                ? "border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50"
                : "border-emerald-300 bg-gradient-to-r from-emerald-50 to-sky-50"
            )}
          >
            <Link href={href} className="flex items-start gap-3 active:scale-[0.99]">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md",
                  isPendingPayment ? "bg-amber-600" : "bg-emerald-600"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-bold uppercase tracking-wide",
                    isPendingPayment ? "text-amber-800" : "text-emerald-800"
                  )}
                >
                  {isPendingPayment ? "Menunggu pembayaran" : "Sedang berjalan"}
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{order.channel_label}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{routeHint(order)}</p>
                <p
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold ring-1",
                    isPendingPayment
                      ? "text-amber-800 ring-amber-200"
                      : "text-emerald-800 ring-emerald-200"
                  )}
                >
                  {order.status_label}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-emerald-800">
                <span className="text-[11px] font-bold">
                  {isPendingPayment ? "Bayar" : "Lacak"}
                </span>
                <ChevronRight className="h-5 w-5" aria-hidden />
              </div>
            </Link>
            {chatOpen ? (
              <Link
                href={chatHref}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white/90 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-50"
              >
                <MessageCircle className="h-4 w-4" />
                Chat driver
                {unread > 0 ? (
                  <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {unread} baru
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
