"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  customerActiveOrderHref,
  forceClearActiveOrdersHint,
  persistActiveOrdersHint,
  WIRA_ACTIVE_ORDER_CHANGED_EVENT,
  type ActiveCustomerOrderHint,
} from "@/lib/customer-active-order";
import { pushCustomerNotification } from "@/lib/customer-notifications";
import { isOrderChatOpen, orderChatChannelName } from "@/lib/order-chat";
import { getOrderChatLastReadIso } from "@/lib/order-chat-read";
import { notifyIncomingChatMessage } from "@/lib/order-chat-notify";
import { decodeStoredChatEntities } from "@/lib/privacy/chat-sanitize";
import type { OrderStatus, ServiceType } from "@/types/database";

export type MonitoredActiveOrder = {
  id: string;
  order_status: OrderStatus;
  delivery_address: string;
  service_type?: ServiceType | null;
  driver_id: string | null;
  merchant_name?: string | null;
  channel_label: string;
  status_label: string;
};

type MonitorContextValue = {
  activeOrders: MonitoredActiveOrder[];
  loading: boolean;
  chatUnreadByOrder: Record<string, number>;
  totalChatUnread: number;
  refresh: () => Promise<void>;
};

const MonitorContext = createContext<MonitorContextValue | null>(null);

function isOnOrderChatPage(pathname: string | null, orderId: string): boolean {
  return Boolean(pathname?.includes(`/orders/${orderId}/chat`));
}

async function fetchActiveOrders(): Promise<MonitoredActiveOrder[]> {
  const res = await fetch(`/api/customer/orders/active?t=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) {
    forceClearActiveOrdersHint();
    return [];
  }
  if (!res.ok) return [];
  const json = (await res.json()) as {
    orders?: MonitoredActiveOrder[];
    order?: MonitoredActiveOrder | null;
  };
  return json.orders ?? (json.order ? [json.order] : []);
}

export function CustomerOrdersMonitorProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string | null;
}) {
  const pathname = usePathname();
  const [activeOrders, setActiveOrders] = useState<MonitoredActiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatUnreadByOrder, setChatUnreadByOrder] = useState<Record<string, number>>({});
  const prevStatusRef = useRef<Record<string, OrderStatus>>({});
  const prevDriverRef = useRef<Record<string, string | null>>({});
  const isFirstLoadRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setActiveOrders([]);
      setChatUnreadByOrder({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const orders = await fetchActiveOrders();

      if (!isFirstLoadRef.current) {
        for (const o of orders) {
          const prev = prevStatusRef.current[o.id];
          const prevDriver = prevDriverRef.current[o.id];
          if (prev && prev !== o.order_status) {
            pushCustomerNotification({
              kind: "status",
              orderId: o.id,
              title: `${o.channel_label} — diperbarui`,
              body: o.status_label,
              href: customerActiveOrderHref(o),
            });
          }
          if (prevDriver === null && o.driver_id) {
            pushCustomerNotification({
              kind: "driver",
              orderId: o.id,
              title: `Driver ditugaskan — ${o.channel_label}`,
              body: "Driver siap melayani pesanan Anda.",
              href: customerActiveOrderHref(o),
            });
          }
        }
      }
      isFirstLoadRef.current = false;

      setActiveOrders(orders);

      const hints: ActiveCustomerOrderHint[] = orders.map((o) => ({
        id: o.id,
        order_status: o.order_status,
        delivery_address: o.delivery_address,
        service_type: o.service_type ?? null,
        driver_id: o.driver_id,
        merchant_name: o.merchant_name ?? null,
        updated_at: new Date().toISOString(),
      }));
      if (hints.length > 0) {
        persistActiveOrdersHint(hints, { silent: true });
      } else {
        forceClearActiveOrdersHint();
      }

      for (const o of orders) {
        prevStatusRef.current[o.id] = o.order_status;
        prevDriverRef.current[o.id] = o.driver_id;
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const recountUnread = useCallback(
    async (orders: MonitoredActiveOrder[]) => {
      if (!userId) return;
      const supabase = createClient();
      const next: Record<string, number> = {};

      await Promise.all(
        orders
          .filter((o) => isOrderChatOpen(o))
          .map(async (o) => {
            if (isOnOrderChatPage(pathname, o.id)) {
              next[o.id] = 0;
              return;
            }
            const lastRead = getOrderChatLastReadIso(o.id, "customer");
            let query = supabase
              .from("order_chats")
              .select("id", { count: "exact", head: true })
              .eq("order_id", o.id)
              .neq("sender_id", userId);
            if (lastRead) query = query.gt("created_at", lastRead);
            const { count } = await query;
            next[o.id] = count ?? 0;
          })
      );

      setChatUnreadByOrder(next);
    },
    [pathname, userId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    void recountUnread(activeOrders);
  }, [activeOrders, pathname, recountUnread, userId]);

  useEffect(() => {
    const onChanged = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(WIRA_ACTIVE_ORDER_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(WIRA_ACTIVE_ORDER_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const ordersChannel = supabase
      .channel(`customer-active-orders:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ordersChannel);
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId || activeOrders.length === 0) return;
    const supabase = createClient();
    const chatOrders = activeOrders.filter((o) => isOrderChatOpen(o));

    const channels = chatOrders.map((order) =>
      supabase
        .channel(`${orderChatChannelName(order.id)}:customer-global`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "order_chats",
            filter: `order_id=eq.${order.id}`,
          },
          (payload) => {
            const row = payload.new as { sender_id?: string; message?: string };
            if (!row.sender_id || row.sender_id === userId) return;

            const preview = decodeStoredChatEntities(row.message ?? "");
            const onChat = isOnOrderChatPage(pathname, order.id);
            if (!onChat) {
              setChatUnreadByOrder((prev) => ({
                ...prev,
                [order.id]: (prev[order.id] ?? 0) + 1,
              }));
            }

            pushCustomerNotification({
              kind: "chat",
              orderId: order.id,
              title: `Chat ${order.channel_label}`,
              body: preview.slice(0, 100) || "Pesan baru dari driver",
              href: `/customer/orders/${order.id}/chat`,
            });

            void notifyIncomingChatMessage({
              orderId: order.id,
              peerLabel: "Driver",
              preview,
              onChatPage: onChat,
            });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [activeOrders, pathname, userId]);

  const totalChatUnread = useMemo(
    () => Object.values(chatUnreadByOrder).reduce((s, n) => s + n, 0),
    [chatUnreadByOrder]
  );

  const value = useMemo(
    () => ({
      activeOrders,
      loading,
      chatUnreadByOrder,
      totalChatUnread,
      refresh,
    }),
    [activeOrders, chatUnreadByOrder, loading, refresh, totalChatUnread]
  );

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>;
}

export function useCustomerOrdersMonitor(): MonitorContextValue {
  const ctx = useContext(MonitorContext);
  if (!ctx) {
    throw new Error("useCustomerOrdersMonitor harus di dalam CustomerOrdersMonitorProvider");
  }
  return ctx;
}
