"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { storeDriverTokens } from "@/lib/driver-native-session";
import {
  postNativeDriverBoot,
  postNativeSessionSync,
} from "@/lib/driver-session-sync";
import { markFreshLogin } from "@/lib/hello-welcome";

const STORAGE_KEY = "wira_bridge_tokens";
const BRIDGE_TIMEOUT_MS = 12_000;

type Tokens = { access_token: string; refresh_token: string };

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

async function verifyDriverSession(
  supabase: ReturnType<typeof createClient>
): Promise<Session | null> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ?? null;
}

async function bridgeServerCookies(tokens: Tokens): Promise<string | null> {
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
    if (/abort/i.test(msg)) {
      return "Sinkron cookie timeout — lanjut dengan sesi lokal.";
    }
    return msg || "Bridge sesi gagal";
  }
}

export default function DriverAppEntryPage() {
  const [msg, setMsg] = useState("Menghubungkan akun...");
  const appliedRef = useRef(false);
  const runningRef = useRef(false);
  const failedRefreshRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin(active: Session) {
      if (cancelled || appliedRef.current) return;

      const supabase = createClient();
      const tokens = {
        access_token: active.access_token,
        refresh_token: active.refresh_token,
      };

      const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
      w.__WIRA_NATIVE_SESSION__ = tokens;
      postNativeSessionSync(tokens);

      setMsg("Menyinkronkan cookie...");
      const bridgeErr = await bridgeServerCookies(tokens);

      const verified = await verifyDriverSession(supabase);
      if (!verified?.user) {
        const rn = (
          window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
        ).ReactNativeWebView;
        rn?.postMessage(
          JSON.stringify({
            type: "WIRA_SESSION_FAILED",
            message: bridgeErr ?? "Sesi driver tidak valid setelah sinkron.",
          })
        );
        setMsg("Gagal sinkron sesi. Login ulang di aplikasi.");
        return;
      }

      appliedRef.current = true;
      storeDriverTokens(
        {
          access_token: verified.access_token,
          refresh_token: verified.refresh_token,
        },
        true
      );
      postNativeDriverBoot("session_ok");
      postNativeDriverBoot("redirecting");

      markFreshLogin();
      await new Promise((r) => setTimeout(r, 200));
      window.location.replace("/driver");
    }

    async function run() {
      if (appliedRef.current || runningRef.current) return;

      const w = window as Window & {
        __WIRA_NATIVE_SESSION__?: Tokens;
      };

      let tokens = w.__WIRA_NATIVE_SESSION__;
      if (!tokens) {
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY);
          if (raw) tokens = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      }

      runningRef.current = true;
      try {
        const supabase = createClient();
        const existing = await verifyDriverSession(supabase);

        if (existing?.user) {
          if (cancelled) return;
          setMsg("Memuat dashboard driver...");
          await completeLogin(existing);
          return;
        }

        if (!tokens?.access_token || !tokens?.refresh_token) return;

        if (failedRefreshRef.current === tokens.refresh_token) return;

        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }

        if (cancelled) return;
        setMsg("Memuat dashboard driver...");

        const { data, error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });

        if (cancelled) return;

        if (error) {
          failedRefreshRef.current = tokens.refresh_token;

          const recovered = await verifyDriverSession(supabase);
          if (recovered?.user) {
            await completeLogin(recovered);
            return;
          }

          const rn = (
            window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
          ).ReactNativeWebView;
          rn?.postMessage(
            JSON.stringify({
              type: "WIRA_SESSION_FAILED",
              message: error.message,
            })
          );
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

        const latest = (await verifyDriverSession(supabase)) ?? data.session;
        await completeLogin(latest);
      } finally {
        runningRef.current = false;
      }
    }

    function onNative(e: Event) {
      if (appliedRef.current || runningRef.current) return;
      const detail = (e as CustomEvent<{ access_token?: string; refresh_token?: string }>)
        .detail;
      if (!detail?.access_token || !detail?.refresh_token) return;

      const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
      const prev = w.__WIRA_NATIVE_SESSION__;
      if (
        prev?.refresh_token === detail.refresh_token &&
        failedRefreshRef.current === detail.refresh_token
      ) {
        return;
      }

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
      const native = (
        window as Window & { __WIRA_NATIVE_SESSION__?: Tokens }
      ).__WIRA_NATIVE_SESSION__;
      if (!native?.access_token || !native?.refresh_token) return;
      if (failedRefreshRef.current === native.refresh_token) return;
      void run();
    }, 1500);

    const timeout = setTimeout(() => {
      if (!cancelled && !appliedRef.current) {
        postNativeDriverBoot("waiting_token");
        setMsg("Menunggu token terlalu lama. Login ulang di aplikasi.");
      }
    }, 20000);

    return () => {
      cancelled = true;
      window.removeEventListener("wira-set-session", onNative);
      clearInterval(poll);
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
