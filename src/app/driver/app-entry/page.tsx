"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { storeDriverTokens } from "@/lib/driver-native-session";
import { postNativeDriverBoot } from "@/lib/driver-session-sync";

const STORAGE_KEY = "wira_bridge_tokens";

export default function DriverAppEntryPage() {
  const [msg, setMsg] = useState("Menghubungkan akun...");
  const appliedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (appliedRef.current || runningRef.current) return;
      const w = window as Window & {
        __WIRA_NATIVE_SESSION__?: { access_token: string; refresh_token: string };
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

      if (!tokens?.access_token || !tokens?.refresh_token) return;

      runningRef.current = true;
      try {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }

        if (cancelled) return;
        setMsg("Memuat dashboard driver...");

        const supabase = createClient();
        const { data, error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });

        if (cancelled) return;

        if (error) {
          const rn = (
            window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
          ).ReactNativeWebView;
          rn?.postMessage(
            JSON.stringify({ type: "WIRA_SESSION_FAILED", message: error.message })
          );
          setMsg(`Gagal sesi: ${error.message}`);
          return;
        }

        if (!data.session?.user) {
          setMsg("Sesi tidak valid.");
          return;
        }

        const {
          data: { session: latest },
        } = await supabase.auth.getSession();
        const active = latest ?? data.session;

        setMsg("Menyinkronkan cookie...");
        try {
          const bridgeRes = await fetch("/api/driver/bridge-session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: active.access_token,
              refresh_token: active.refresh_token,
            }),
          });
          if (!bridgeRes.ok) {
            const j = (await bridgeRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? "Bridge sesi gagal");
          }
        } catch (bridgeErr) {
          const rn = (
            window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
          ).ReactNativeWebView;
          rn?.postMessage(
            JSON.stringify({
              type: "WIRA_SESSION_FAILED",
              message:
                bridgeErr instanceof Error ? bridgeErr.message : "Bridge sesi gagal",
            })
          );
          setMsg("Gagal sinkron sesi. Login ulang di aplikasi.");
          return;
        }

        appliedRef.current = true;
        storeDriverTokens(
          {
            access_token: active.access_token,
            refresh_token: active.refresh_token,
          },
          true
        );
        postNativeDriverBoot("session_ok");
        postNativeDriverBoot("redirecting");

        await new Promise((r) => setTimeout(r, 350));
        window.location.replace("/driver");
      } finally {
        runningRef.current = false;
      }
    }

    function onNative(e: Event) {
      if (appliedRef.current || runningRef.current) return;
      const detail = (e as CustomEvent<{ access_token?: string; refresh_token?: string }>)
        .detail;
      if (detail?.access_token && detail.refresh_token) {
        (window as Window & { __WIRA_NATIVE_SESSION__?: typeof detail }).__WIRA_NATIVE_SESSION__ =
          detail;
        void run();
      }
    }

    window.addEventListener("wira-set-session", onNative);
    void run();

    const poll = setInterval(() => {
      if (appliedRef.current || runningRef.current) return;
      const native = (
        window as Window & {
          __WIRA_NATIVE_SESSION__?: { access_token: string; refresh_token: string };
        }
      ).__WIRA_NATIVE_SESSION__;
      if (native?.access_token && native.refresh_token) void run();
    }, 500);

    const timeout = setTimeout(() => {
      if (!cancelled && !appliedRef.current) {
        postNativeDriverBoot("waiting_token");
        setMsg("Menunggu token terlalu lama. Login ulang di aplikasi.");
      }
    }, 12000);

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
