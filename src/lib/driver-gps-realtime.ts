/** Event & channel Supabase Realtime Broadcast untuk posisi driver (tanpa UPDATE DB tiap detik). */

export const DRIVER_GPS_BROADCAST_EVENT = "position" as const;

/** Channel per driver — customer yang melacak order aktif. */
export function driverGpsChannel(driverId: string): string {
  return `driver-gps:${driverId}`;
}

/** Channel agregat — admin live map & dashboard operasional. */
export const DRIVER_GPS_ADMIN_CHANNEL = "driver-gps:admin" as const;

export type DriverGpsBroadcastPayload = {
  driverId: string;
  lat: number;
  lng: number;
  status?: string;
  ts: number;
};

export function isValidGpsBroadcastPayload(
  raw: unknown
): raw is DriverGpsBroadcastPayload {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.driverId === "string" &&
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    typeof p.ts === "number"
  );
}
