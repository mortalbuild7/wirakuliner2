"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  DRIVER_GPS_ADMIN_CHANNEL,
  DRIVER_GPS_BROADCAST_EVENT,
  driverGpsChannel,
  type DriverGpsBroadcastPayload,
  isValidGpsBroadcastPayload,
} from "@/lib/driver-gps-realtime";

const BROADCAST_MIN_MS = 2_000;

/**
 * Kirim posisi driver via Realtime Broadcast (WebSocket) — tanpa UPDATE DB tiap detik.
 */
export async function broadcastDriverGpsPosition(
  supabase: SupabaseClient,
  payload: DriverGpsBroadcastPayload
): Promise<void> {
  const driverChannel = supabase.channel(driverGpsChannel(payload.driverId), {
    config: { broadcast: { ack: false, self: false } },
  });
  const adminChannel = supabase.channel(DRIVER_GPS_ADMIN_CHANNEL, {
    config: { broadcast: { ack: false, self: false } },
  });

  await Promise.all([driverChannel.subscribe(), adminChannel.subscribe()]);

  const message = {
    type: "broadcast" as const,
    event: DRIVER_GPS_BROADCAST_EVENT,
    payload,
  };

  await Promise.all([
    driverChannel.send(message),
    adminChannel.send(message),
  ]);

  supabase.removeChannel(driverChannel);
  supabase.removeChannel(adminChannel);
}

/** Hook driver — broadcast GPS realtime + throttle persist DB via callback. */
export function useDriverGpsBroadcast(
  driverId: string | undefined,
  status: string | undefined,
  enabled: boolean,
  onPersist: (lat: number, lng: number) => Promise<void>
) {
  const lastBroadcastRef = useRef(0);
  const lastPersistRef = useRef(0);
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const adminChannelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);

  useEffect(() => {
    if (!enabled || !driverId || !status || status === "offline") {
      const supabase = createClient();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (adminChannelRef.current) supabase.removeChannel(adminChannelRef.current);
      channelRef.current = null;
      adminChannelRef.current = null;
      return;
    }

    const supabase = createClient();
    const driverCh = supabase.channel(driverGpsChannel(driverId), {
      config: { broadcast: { ack: false, self: false } },
    });
    const adminCh = supabase.channel(DRIVER_GPS_ADMIN_CHANNEL, {
      config: { broadcast: { ack: false, self: false } },
    });
    driverCh.subscribe();
    adminCh.subscribe();
    channelRef.current = driverCh;
    adminChannelRef.current = adminCh;

    return () => {
      supabase.removeChannel(driverCh);
      supabase.removeChannel(adminCh);
      channelRef.current = null;
      adminChannelRef.current = null;
    };
  }, [driverId, status, enabled]);

  return async (lat: number, lng: number) => {
    if (!enabled || !driverId || !status || status === "offline") return;

    const now = Date.now();
    const payload: DriverGpsBroadcastPayload = {
      driverId,
      lat,
      lng,
      status,
      ts: now,
    };

    if (now - lastBroadcastRef.current >= BROADCAST_MIN_MS) {
      lastBroadcastRef.current = now;
      const message = {
        type: "broadcast" as const,
        event: DRIVER_GPS_BROADCAST_EVENT,
        payload,
      };
      void channelRef.current?.send(message);
      void adminChannelRef.current?.send(message);
    }

    const PERSIST_MS = 60_000;
    if (now - lastPersistRef.current >= PERSIST_MS) {
      lastPersistRef.current = now;
      await onPersist(lat, lng);
    }
  };
}
