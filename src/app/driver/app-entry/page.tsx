"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient, resetBrowserClient } from "@/lib/supabase/client";
import { storeDriverTokens } from "@/lib/driver-native-session";
import {
  postNativeDriverBoot,
  postNativeSessionSync,
} from "@/lib/driver-session-sync";
import { markFreshLogin } from "@/lib/hello-welcome";

const STORAGE_KEY = "wira_bridge_tokens";
const BRIDGE_TIMEOUT_MS = 8_000;
const APK_SESSION_POLL_MS = 500;
const APK_SESSION_REQUEST_MS = 2_000;

type Tokens = { access_token: string; refresh_token: string };

function isApkWebView(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    ReactNativeWebView?: unknown;
    __WIRA_APK_WEBVIEW__?: boolean;
  };
  return Boolean(w.ReactNativeWebView || w.__WIRA_APK_WEBVIEW__);
}

function readInjectedTokens(): Tokens | null {
  const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
  if (w.__WIRA_NATIVE_SESSION__?.access_token && w.__WIRA_NATIVE_SESSION__?.refresh_token) {
    return w.__WIRA_NATIVE_SESSION__;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Tokens;
    if (parsed.access_token && parsed.refresh_token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function isRefreshReuseError(message?: string) {
  return Boolean(
    message &&
      (/refresh token/i.test(message) ||
        /invalid.*token/i.test(message) ||
        /already been used/i.test(message))
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalSession(
  supabase: ReturnType<typeof createClient>
): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ? session : null;
}

function bridgeServerCookiesFireAndForget(tokens: Tokens) {
  void fetchWithTimeout(
    "/api/driver/bridge-session",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    },
    BRIDGE_TIMEOUT_MS
  ).catch(() => {});
}

async function bridgeServerCookiesBlocking(tokens: Tokens): Promise<string | null> {
  try {
    const bridgeRes = await fetchWithTimeout(
      "/api/driver/bridge-session",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokens),
      },
      BRIDGE_TIMEOUT_MS
    );

    if (bridgeRes.ok) return null;

    const j = (await bridgeRes.json().catch(() => ({}))) as { error?: string };
    return j.error ?? `Bridge gagal (HTTP ${bridgeRes.status})`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) return "Sinkron cookie timeout.";
    return msg || "Bridge sesi gagal";
  }
}

function requestNativeSession() {
  const rn = (
    window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
  ).ReactNativeWebView;
  rn?.postMessage(JSON.stringify({ type: "WIRA_REQUEST_SESSION" }));
}

function apkRedirectToDriver(tokens: Tokens) {
  const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
  w.__WIRA_NATIVE_SESSION__ = tokens;
  storeDriverTokens(tokens, true);
  postNativeSessionSync(tokens);
  postNativeDriverBoot("session_ok");
  markFreshLogin();
  bridgeServerCookiesFireAndForget(tokens);

  const target = `${window.location.origin}/driver`;
  const rn = (
    window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
  ).ReactNativeWebView;
  rn?.postMessage(JSON.stringify({ type: "WIRA_GO_DRIVER", url: target }));

  try {
    window.location.replace(target);
  } catch {
    window.location.href = target;
  }
}

export default function DriverAppEntryPage() {
  const [msg, setMsg] = useState("Menghubungkan akun...");
  const appliedRef = useRef(false);
  const runningRef = useRef(false);
  const failedRefreshRef = useRef<string | null>(null);

  useEffect(() => {
    resetBrowserClient();
    let cancelled = false;

    if (isApkWebView()) {
      const early = readInjectedTokens();
      if (early) {
        appliedRef.current = true;
        apkRedirectToDriver(early);
        return;
      }
      requestNativeSession();
    }

    function goToDriver(tokens: Tokens) {
      if (isApkWebView()) {
        appliedRef.current = true;
        apkRedirectToDriver(tokens);
        return;
      }

      markFreshLogin();
      postNativeDriverBoot("redirecting");
      window.location.replace(`${window.location.origin}/driver`);
    }

    async function completeLogin(active: Session) {
      if (cancelled || appliedRef.current) return;
      appliedRef.current = true;

      const tokens = {
        access_token: active.access_token,
        refresh_token: active.refresh_token,
      };

      if (isApkWebView()) {
        goToDriver(tokens);
        return;
      }

      const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
      w.__WIRA_NATIVE_SESSION__ = tokens;
      postNativeSessionSync(tokens);
      storeDriverTokens(tokens, true);
      postNativeDriverBoot("session_ok");

      setMsg("Menyinkronkan cookie...");
      const bridgeErr = await bridgeServerCookiesBlocking(tokens);
      const verified = await readLocalSession(createClient());
      if (!verified?.user) {
        appliedRef.current = false;
        setMsg("Gagal sinkron sesi. Login ulang di aplikasi.");
        return;
      }

      storeDriverTokens(
        {
          access_token: verified.access_token,
          refresh_token: verified.refresh_token,
        },
        true
      );
      goToDriver({
        access_token: verified.access_token,
        refresh_token: verified.refresh_token,
      });
    }

    async function run() {
      if (appliedRef.current || runningRef.current) return;

      const tokens = readInjectedTokens();
      if (isApkWebView() && tokens) {
        appliedRef.current = true;
        apkRedirectToDriver(tokens);
        return;
      }

      runningRef.current = true;
      try {
        const supabase = createClient();
        const existing = await readLocalSession(supabase);

        if (existing?.user) {
          if (cancelled) return;
          await completeLogin(existing);
          return;
        }

        if (!tokens?.access_token || !tokens?.refresh_token) return;
        if (failedRefreshRef.current === tokens.refresh_token) return;

        if (cancelled) return;
        setMsg("Memuat dashboard driver...");

        const { data, error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });

        if (cancelled) return;

        if (error) {
          failedRefreshRef.current = tokens.refresh_token;
          const recovered = await readLocalSession(supabase);
          if (recovered?.user) {
            await completeLogin(recovered);
            return;
          }
          setMsg(
            isRefreshReuseError(error.message)
              ? "Sesi bentrok. Tutup app, buka lagi, lalu login ulang."
              : `Gagal sesi: ${error.message}`
          );
          return;
        }

        if (!data.session?.user) {
          setMsg("Sesi tidak valid.");
          return;
        }

        await completeLogin((await readLocalSession(supabase)) ?? data.session);
      } finally {
        runningRef.current = false;
      }
    }

    function onNative(e: Event) {
      if (appliedRef.current || runningRef.current) return;
      const detail = (e as CustomEvent<{ access_token?: string; refresh_token?: string }>)
        .detail;
      if (!detail?.access_token || !detail?.refresh_token) return;

      if (isApkWebView()) {
        appliedRef.current = true;
        apkRedirectToDriver({
          access_token: detail.access_token,
          refresh_token: detail.refresh_token,
        });
        return;
      }

      const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
      w.__WIRA_NATIVE_SESSION__ = {
        access_token: detail.access_token,
        refresh_token: detail.refresh_token,
      };
      void run();
    }

    window.addEventListener("wira-set-session", onNative);
    void run();

    const poll = setInterval(() => {
      if (appliedRef.current || runningRef.current) return;
      const native = readInjectedTokens();
      if (!native) {
        if (isApkWebView()) requestNativeSession();
        return;
      }
      if (failedRefreshRef.current === native.refresh_token) return;
      if (isApkWebView()) {
        appliedRef.current = true;
        apkRedirectToDriver(native);
        return;
      }
      void run();
    }, APK_SESSION_POLL_MS);

    const requestTimer = setInterval(() => {
      if (appliedRef.current || !isApkWebView()) return;
      if (readInjectedTokens()) return;
      requestNativeSession();
    }, APK_SESSION_REQUEST_MS);

    const timeout = setTimeout(() => {
      if (!cancelled && !appliedRef.current) {
        postNativeDriverBoot("waiting_token");
        setMsg("Menunggu token terlalu lama. Tutup app, buka lagi, lalu login ulang.");
      }
    }, 12_000);

    return () => {
      cancelled = true;
      window.removeEventListener("wira-set-session", onNative);
      clearInterval(poll);
      clearInterval(requestTimer);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p className="text-sm text-emerald-200/90">{msg}</p>
      </div>
    </div>
  );
}
