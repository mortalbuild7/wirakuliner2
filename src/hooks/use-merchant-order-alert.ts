"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isOrderAlertAudioUnlocked,
  playMerchantNewOrderSound,
  unlockOrderAlertAudio,
} from "@/lib/order-alert-sound";

const ALERT_STATUSES = new Set(["paid", "pending_payment"]);

type OrderRow = { id: string; order_status: string; merchant_id?: string };

function isAlertStatus(status: string | undefined): status is "paid" | "pending_payment" {
  return Boolean(status && ALERT_STATUSES.has(status));
}

/** Pantau pesanan merchant + suara keras saat order baru masuk. */
export function useMerchantOrderAlert() {
  const [audioReady, setAudioReady] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const alertedStatusRef = useRef<Map<string, Set<string>>>(new Map());
  const merchantIdRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);
  const supabase = createClient();

  const refreshAudioState = useCallback(() => {
    setAudioReady(isOrderAlertAudioUnlocked());
  }, []);

  const enableAudio = useCallback(async () => {
    await unlockOrderAlertAudio();
    await playMerchantNewOrderSound();
    refreshAudioState();
  }, [refreshAudioState]);

  const markStatusSeen = useCallback((orderId: string, status: string) => {
    const set = alertedStatusRef.current.get(orderId) ?? new Set<string>();
    set.add(status);
    alertedStatusRef.current.set(orderId, set);
  }, []);

  const needsAlert = useCallback((order: OrderRow): boolean => {
    if (!isAlertStatus(order.order_status)) return false;
    const seen = alertedStatusRef.current.get(order.id);
    return !seen?.has(order.order_status);
  }, []);

  const triggerAlert = useCallback(
    (order: OrderRow) => {
      if (!needsAlert(order)) return;
      markStatusSeen(order.id, order.order_status);
      void playMerchantNewOrderSound();
      setFlash(`Pesanan baru #${order.id.slice(0, 8).toUpperCase()}`);
      window.setTimeout(() => setFlash(null), 10_000);
    },
    [markStatusSeen, needsAlert]
  );

  const bootstrapOrders = useCallback((rows: OrderRow[]) => {
    for (const row of rows) {
      if (row.id && row.order_status) {
        markStatusSeen(row.id, row.order_status);
      }
    }
    bootstrappedRef.current = true;
  }, [markStatusSeen]);

  const inspectOrders = useCallback(
    (rows: OrderRow[]) => {
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
      if (!bootstrappedRef.current) return;
      if (!merchantIdRef.current || row?.merchant_id !== merchantIdRef.current) return;
      if (!row?.id || !row.order_status) return;
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
    };
  }, [refreshAudioState, supabase, syncOrders, triggerAlert]);

  return { audioReady, flash, enableAudio };
}
