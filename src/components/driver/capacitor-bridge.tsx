"use client";

import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useCapacitorPush } from "@/hooks/use-capacitor-push";

/** Inisialisasi native bridge (FCM) saat driver login di APK */
export function CapacitorBridge() {
  const { driver, loading } = useDriverProfile();
  useCapacitorPush(!loading && Boolean(driver));
  return null;
}
