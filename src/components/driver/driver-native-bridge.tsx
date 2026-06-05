"use client";

import { useEffect } from "react";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverStatusActions } from "@/hooks/use-driver-status-actions";

/** Bridge perintah dari toolbar native Expo → web driver (on/off, logout). */
export function DriverNativeBridge() {
  const { driver, refresh } = useDriverProfile();
  const { setOnline, logout } = useDriverStatusActions(driver, refresh);

  useEffect(() => {
    async function onNativeCommand(e: Event) {
      const detail = (e as CustomEvent<{ action?: string; online?: boolean }>).detail;
      if (!detail?.action) return;

      if (detail.action === "toggle") {
        const target = typeof detail.online === "boolean" ? detail.online : undefined;
        if (target === undefined) return;
        await setOnline(target);
      } else if (detail.action === "logout") {
        await logout({ skipConfirm: true });
      }
    }

    window.addEventListener("wira-native-driver", onNativeCommand);
    return () => window.removeEventListener("wira-native-driver", onNativeCommand);
  }, [setOnline, logout]);

  return null;
}
