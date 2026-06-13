"use client";

import { useEffect } from "react";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useCapacitorPush } from "@/hooks/use-capacitor-push";
import { isCapacitorNative } from "@/lib/capacitor";

/** Inisialisasi native bridge (FCM) + class APK putih untuk Capacitor. */
export function CapacitorBridge() {
  const { driver, loading } = useDriverProfile();
  useCapacitorPush(!loading && Boolean(driver));

  useEffect(() => {
    if (!isCapacitorNative() || typeof document === "undefined") return;
    document.documentElement.classList.add("wira-apk-webview", "wira-capacitor-apk");
    document.documentElement.style.backgroundColor = "#ffffff";
    document.body.style.backgroundColor = "#ffffff";
  }, []);

  return null;
}
