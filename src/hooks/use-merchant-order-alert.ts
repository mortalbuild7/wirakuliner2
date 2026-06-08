"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { channelLabel, isNgojekOrder, isOnsiteOrder } from "@/lib/order-channel";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";
import {
  isOrderAlertAudioUnlocked,
  playMerchantNewOrderSound,
  unlockOrderAlertAudio,
} from "@/lib/order-alert-sound";

const ALERT_STATUSES = new Set(["paid", "pending_payment"]);

type OrderRow = {
  id: string;
  order_status: string;
  merchant_id?: string;
  delivery_address?: string;
};

export type MerchantOrderFlash = {
  orderId: string;
  shortId: string;
  status: string;
  statusLabel: string;
  channel: string;
};

export type MerchantOrderAlertState = {
  audioReady: boolean;
  flash: string | null;
  flashDetail: MerchantOrderFlash | null;
  pendingActionCount: number;
  enableAudio: () => Promise<void>;
  dismissFlash: () => void;
};

function isAlertStatus(status: string | undefined): status is "paid" | "pending_payment" {
  return Boolean(status && ALERT_STATUSES.has(status));
}

function countPendingActions(rows: OrderRow[]): number {
  return rows.filter((o) => {
    const addr = o.delivery_address ?? "";
    if (isNgojekOrder(addr)) return false;
    if (o.order_status === "paid") return true;
    return o.order_status === "pending_payment" && isOnsiteOrder(addr);
  }).length;
}

async function requestBrowserNotifyPermission(): Promise<void> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

function showBrowserNotify(order: OrderRow): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const addr = order.delivery_address ?? "";
  const channel = channelLabel(addr);
  const statusLabel =
    ORDER_STATUS_LABEL[order.order_status as keyof typeof ORDER_STATUS_LABEL] ??
    order.order_status;

  try {
    new Notification("Pesanan baru masuk!", {
      body: `${channel} · #${order.id.slice(0, 8).toUpperCase()} · ${statusLabel}`,
      icon: "/icon.png",
      tag: `wira-merchant-order-${order.id}`,
    });
  } catch {
    /* ignore */
  }
}

/** Pantau pesanan merchant + suara & notifikasi saat order baru masuk. */
export function useMerchantOrderAlert(): MerchantOrderAlertState {
  const [audioReady, setAudioReady] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashDetail, setFlashDetail] = useState<MerchantOrderFlash | null>(null);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const alertedStatusRef = useRef<Map<string, Set<string>>>(new Map());
  const merchantIdRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const supabase = createClient();

  const refreshAudioState = useCallback(() => {
    setAudioReady(isOrderAlertAudioUnlocked());
  }, []);

  const dismissFlash = useCallback(() => {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlash(null);
    setFlashDetail(null);
  }, []);

  const enableAudio = useCallback(async () => {
    await unlockOrderAlertAudio();
    await requestBrowserNotifyPermission();
    await playMerchantNewOrderSound();
    refreshAudioState();
  }, [refreshAudioState]);

  const markStatusSeen = useCallback((orderId: string, status: string) => {
    const set = alertedStatusRef.current.get(orderId) ?? new Set<string>();
    set.add(status);
    alertedStatusRef.current.set(orderId, set);
  }, []);

  const needsAlert = useCallback((order: OrderRow): boolean => {
    const addr = order.delivery_address ?? "";
    if (isNgojekOrder(addr)) return false;
    if (!isAlertStatus(order.order_status)) return false;
    const seen = alertedStatusRef.current.get(order.id);
    return !seen?.has(order.order_status);
  }, []);

  const triggerAlert = useCallback(
    (order: OrderRow) => {
      if (!needsAlert(order)) return;
      markStatusSeen(order.id, order.order_status);

      void playMerchantNewOrderSound();
      showBrowserNotify(order);

      const addr = order.delivery_address ?? "";
      const detail: MerchantOrderFlash = {
        orderId: order.id,
        shortId: order.id.slice(0, 8).toUpperCase(),
        status: order.order_status,
        statusLabel:
          ORDER_STATUS_LABEL[order.order_status as keyof typeof ORDER_STATUS_LABEL] ??
          order.order_status,
        channel: channelLabel(addr),
      };

      setFlashDetail(detail);
      setFlash(`Pesanan baru #${detail.shortId} (${detail.channel})`);

      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        setFlash(null);
        setFlashDetail(null);
        flashTimerRef.current = null;
      }, 12_000);
    },
    [markStatusSeen, needsAlert]
  );

  const bootstrapOrders = useCallback((rows: OrderRow[]) => {
    for (const row of rows) {
      if (row.id && row.order_status) {
        markStatusSeen(row.id, row.order_status);
      }
    }
    setPendingActionCount(countPendingActions(rows));
    bootstrappedRef.current = true;
  }, [markStatusSeen]);

  const inspectOrders = useCallback(
    (rows: OrderRow[]) => {
      setPendingActionCount(countPendingActions(rows));
      if (!bootstrappedRef.current) return;
      for (const row of rows) {
        triggerAlert(row);
      }
    },
    [triggerAlert]
  );

  const syncOrders = useCallback(async () => {
    const res = await fetch("/api/merchant/orders", { credentials: "include" });
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as {
      merchantId?: string;
      orders?: OrderRow[];
    };
    if (!json.merchantId) return;
    merchantIdRef.current = json.merchantId;
    const rows = json.orders ?? [];
    if (!bootstrappedRef.current) {
      bootstrapOrders(rows);
      return;
    }
    inspectOrders(rows);
  }, [bootstrapOrders, inspectOrders]);

  useEffect(() => {
    refreshAudioState();
    void syncOrders();

    const handleRow = (row: OrderRow | undefined) => {
      if (!row?.id || !row.order_status) return;
      if (!merchantIdRef.current || row.merchant_id !== merchantIdRef.current) return;
      if (isNgojekOrder(row.delivery_address ?? "")) return;

      void syncOrders();

      if (!bootstrappedRef.current) return;
      triggerAlert(row);
    };

    const ch = supabase
      .channel("merchant-order-alert")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        handleRow(payload.new as OrderRow | undefined);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        handleRow(payload.new as OrderRow | undefined);
      })
      .subscribe();

    const poll = window.setInterval(() => {
      void syncOrders();
    }, 8000);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, [refreshAudioState, supabase, syncOrders, triggerAlert]);

  return {
    audioReady,
    flash,
    flashDetail,
    pendingActionCount,
    enableAudio,
    dismissFlash,
  };
}
