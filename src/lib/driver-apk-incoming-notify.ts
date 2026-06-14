import {
  channelLabelFromRecord,
  parseTransitLegs,
} from "@/lib/order-channel";
import { formatIdr } from "@/lib/utils";

import type { ServiceType } from "@/types/database";

type IncomingOrderPayload = {
  id: string;
  delivery_address: string;
  delivery_fee?: number | string | null;
  service_type?: ServiceType | null;
};

export function isDriverApkWebView(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    ReactNativeWebView?: { postMessage: (s: string) => void };
    __WIRA_APK_WEBVIEW__?: boolean;
  };
  return Boolean(w.ReactNativeWebView || w.__WIRA_APK_WEBVIEW__);
}

/** Kirim order ke APK native — notifikasi status bar Android, tanpa popup di WebView. */
export function notifyDriverApkIncomingOrder(order: IncomingOrderPayload): void {
  const rn = (
    window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }
  ).ReactNativeWebView;
  if (!rn) return;

  const channel = channelLabelFromRecord(order);
  const legs = parseTransitLegs(order.delivery_address);
  const route =
    legs?.pickup && legs?.destination
      ? `${legs.pickup} → ${legs.destination}`
      : order.delivery_address.replace(/^\[[^\]]+\]\s*/, "").slice(0, 96);
  const fee = formatIdr(Number(order.delivery_fee ?? 0));

  rn.postMessage(
    JSON.stringify({
      type: "WIRA_INCOMING_ORDER",
      orderId: order.id,
      title: `Order masuk — ${channel}`,
      body: `${route} · ${fee}`,
      channel,
    })
  );
}
