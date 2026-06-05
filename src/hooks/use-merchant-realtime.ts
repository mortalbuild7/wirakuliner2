"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Merchant } from "@/types/database";

const POLL_MS = 6_000;

function isMerchantPayload(row: unknown): row is Merchant {
  return (
    typeof row === "object" &&
    row !== null &&
    "id" in row &&
    typeof (row as Merchant).id === "string"
  );
}

/** Semua toko di etalase — patch status tanpa reload halaman */
export function useMerchantListRealtime(
  onPatch: (updated: Merchant) => void,
  onResync?: () => void | Promise<void>
) {
  const onPatchRef = useRef(onPatch);
  const onResyncRef = useRef(onResync);
  onPatchRef.current = onPatch;
  onResyncRef.current = onResync;

  useEffect(() => {
    const supabase = createClient();
    let pollId: ReturnType<typeof setInterval> | null = null;
    let realtimeOk = false;

    const resync = () => void onResyncRef.current?.();

    const channel = supabase
      .channel("customer-etalase-merchants")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "merchants" },
        (payload) => {
          if (isMerchantPayload(payload.new)) {
            onPatchRef.current(payload.new);
          } else {
            resync();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeOk = true;
          if (pollId) {
            clearInterval(pollId);
            pollId = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeOk = false;
          startPoll();
        }
      });

    function startPoll() {
      if (pollId) return;
      pollId = setInterval(() => {
        if (!realtimeOk) resync();
      }, POLL_MS);
    }

    startPoll();

    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      if (pollId) clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

/** Satu toko — update langsung saat merchant buka/tutup */
export function useSingleMerchantRealtime(
  merchantId: string | undefined,
  onUpdate: (merchant: Merchant) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!merchantId) return;

    const supabase = createClient();
    let pollId: ReturnType<typeof setInterval> | null = null;
    let realtimeOk = false;

    async function fetchOne() {
      const { data } = await supabase
        .from("merchants")
        .select("*")
        .eq("id", merchantId)
        .single();
      if (data) onUpdateRef.current(data);
    }

    const channel = supabase
      .channel(`customer-merchant-${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "merchants",
          filter: `id=eq.${merchantId}`,
        },
        (payload) => {
          if (isMerchantPayload(payload.new)) {
            onUpdateRef.current(payload.new);
          } else {
            void fetchOne();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeOk = true;
          if (pollId) {
            clearInterval(pollId);
            pollId = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeOk = false;
          startPoll();
        }
      });

    function startPoll() {
      if (pollId) return;
      pollId = setInterval(() => {
        if (!realtimeOk) void fetchOne();
      }, POLL_MS);
    }

    startPoll();

    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOne();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      if (pollId) clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [merchantId]);
}
