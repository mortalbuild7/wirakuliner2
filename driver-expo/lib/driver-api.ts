import { getDriverBaseUrl } from "./supabase";

export type NativeDriverProfile = {
  id: string;
  profile_id: string | null;
  name: string;
  phone: string;
  vehicle_plate: string | null;
  photo_url?: string | null;
  status: string;
  current_lat: number | null;
  current_lng: number | null;
  reward_points?: number;
  created_at?: string | null;
  service_category?: string | null;
  fcm_token?: string | null;
};

const NATIVE_FETCH_TIMEOUT_MS = 18_000;

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = NATIVE_FETCH_TIMEOUT_MS
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      json: { error: /abort/i.test(msg) ? "Koneksi timeout" : msg } as {
        error?: string;
        driver?: NativeDriverProfile;
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDriverMeNative(accessToken: string) {
  const { ok, json } = await fetchJsonWithTimeout(
    `${getDriverBaseUrl()}/api/driver/me`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return { ok, json: json as { driver?: NativeDriverProfile; error?: string } };
}

export async function setDriverStatusNative(
  accessToken: string,
  status: "idle" | "offline"
) {
  const { ok, json } = await fetchJsonWithTimeout(
    `${getDriverBaseUrl()}/api/driver/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status }),
    },
    12_000
  );
  return { ok, json: json as { error?: string } };
}
