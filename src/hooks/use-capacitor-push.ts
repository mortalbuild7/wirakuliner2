"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isCapacitorNative } from "@/lib/capacitor";

async function saveFcmToken(token: string, platform: string) {
  await fetch("/api/driver/fcm-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fcmToken: token, platform }),
  });
}

/** FCM Android via Capacitor Push Notifications */
export function useCapacitorPush(enabled: boolean) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !isCapacitorNative() || started.current) return;
    started.current = true;

    let removeListeners: (() => void) | undefined;

    (async () => {
      try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { Capacitor } = await import("@capacitor/core");

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      const regHandler = await PushNotifications.addListener(
        "registration",
        async (ev) => {
          if (ev.value) {
            await saveFcmToken(ev.value, Capacitor.getPlatform());
          }
        }
      );

      const errHandler = await PushNotifications.addListener(
        "registrationError",
        (err) => console.warn("FCM registration error", err)
      );

      const actionHandler = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const orderId = action.notification.data?.order_id as string | undefined;
          if (orderId) {
            router.push(`/driver/orders/${orderId}`);
          } else {
            router.push("/driver/jobs");
          }
        }
      );

      await PushNotifications.register();

      removeListeners = () => {
        regHandler.remove();
        errHandler.remove();
        actionHandler.remove();
      };
      } catch (e) {
        console.warn("[capacitor-push]", e);
      }
    })();

    return () => {
      removeListeners?.();
    };
  }, [enabled, router]);
}
