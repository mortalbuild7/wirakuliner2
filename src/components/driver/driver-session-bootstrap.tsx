"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureDriverNativeSession } from "@/lib/driver-native-session";

/** Terapkan token dari bridge HTML / toolbar native (WebView sering tidak simpan cookie dari fetch). */
export function DriverSessionBootstrap() {
  useEffect(() => {
    const supabase = createClient();

    async function run() {
      await ensureDriverNativeSession(supabase);
    }

    function onNative() {
      void run();
    }

    void run();
    window.addEventListener("wira-set-session", onNative);

    return () => {
      window.removeEventListener("wira-set-session", onNative);
    };
  }, []);

  return null;
}
