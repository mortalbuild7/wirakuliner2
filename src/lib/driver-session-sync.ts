function postNative(payload: Record<string, unknown>) {
  const rn = (
    window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
  ).ReactNativeWebView;
  rn?.postMessage(JSON.stringify(payload));
}

/** Kirim refresh token terbaru ke APK native (hindari rotasi token bentrok). */
export function postNativeSessionSync(session: {
  access_token: string;
  refresh_token: string;
}) {
  postNative({
    type: "WIRA_SESSION_SYNC",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

/** Kabari native: tahap boot web driver (untuk matikan spinner). */
export function postNativeDriverBoot(step: "session_ok" | "redirecting" | "waiting_token") {
  postNative({ type: "WIRA_DRIVER_BOOT", step });
}
