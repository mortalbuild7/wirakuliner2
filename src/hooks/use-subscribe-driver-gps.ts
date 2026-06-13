"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DRIVER_GPS_ADMIN_CHANNEL,
  DRIVER_GPS_BROADCAST_EVENT,
  driverGpsChannel,
  isValidGpsBroadcastPayload,
} from "@/lib/driver-gps-realtime";

/** Customer — lacak posisi driver aktif via Realtime Broadcast (bukan poll DB). */
export function useSubscribeDriverGps(
  driverId: string | null | undefined,
  enabled: boolean,
  onPosition: (lat: number, lng: number) => void
) {
  useEffect(() => {
    if (!enabled || !driverId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(driverGpsChannel(driverId))
      .on(
        "broadcast",
        { event: DRIVER_GPS_BROADCAST_EVENT },
        ({ payload }) => {
          if (!isValidGpsBroadcastPayload(payload)) return;
          if (payload.driverId !== driverId) return;
          onPosition(payload.lat, payload.lng);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, enabled, onPosition]);
}

/** Admin live map — channel agregat semua driver online. */
export function useSubscribeAdminDriverGps(
  enabled: boolean,
  onDriverPosition: (
    driverId: string,
    lat: number,
    lng: number,
    status?: string
  ) => void
) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase
      .channel(DRIVER_GPS_ADMIN_CHANNEL)
      .on(
        "broadcast",
        { event: DRIVER_GPS_BROADCAST_EVENT },
        ({ payload }) => {
          if (!isValidGpsBroadcastPayload(payload)) return;
          onDriverPosition(
            payload.driverId,
            payload.lat,
            payload.lng,
            payload.status
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, onDriverPosition]);
}
