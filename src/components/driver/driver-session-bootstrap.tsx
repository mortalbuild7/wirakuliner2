"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  bindDriverNativeSessionSync,
  ensureDriverNativeSession,
} from "@/lib/driver-native-session";

/** Terapkan & sinkronkan token APK ↔ WebView (hindari refresh token bentrok). */
export function DriverSessionBootstrap() {
  useEffect(() => {
    const supabase = createClient();

    async function run() {
      await ensureDriverNativeSession(supabase);
    }

    function onNative() {
      const w = window as Window & { __WIRA_NATIVE_SESSION_APPLIED__?: boolean };
      w.__WIRA_NATIVE_SESSION_APPLIED__ = false;
      void run();
    }

    void run();
    const unbind = bindDriverNativeSessionSync(supabase);
    window.addEventListener("wira-set-session", onNative);

    return () => {
      unbind();
      window.removeEventListener("wira-set-session", onNative);
    };
  }, []);

  return null;
}
