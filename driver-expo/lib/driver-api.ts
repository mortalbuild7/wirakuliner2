import { getDriverBaseUrl } from "./supabase";

type DriverMe = {
  id: string;
  status: string;
  name: string;
};

export async function fetchDriverMeNative(accessToken: string) {
  const res = await fetch(`${getDriverBaseUrl()}/api/driver/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json: json as { driver?: DriverMe; error?: string } };
}

export async function setDriverStatusNative(
  accessToken: string,
  status: "idle" | "offline"
) {
  const res = await fetch(`${getDriverBaseUrl()}/api/driver/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}
