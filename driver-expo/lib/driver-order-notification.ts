import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "wira-driver-incoming-orders";

let initialized = false;

/**
 * Notifikasi order masuk di status bar Android — tanpa heads-up popup di layar app.
 * Kartu order di WebView tetap satu-satunya UI di dalam aplikasi.
 */
export async function initDriverOrderNotifications(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (initialized) return true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return false;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Order Masuk",
    description: "Pesanan baru untuk driver WIRA",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 220, 120, 220, 120, 400],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });

  initialized = true;
  return true;
}

export async function postIncomingOrderNotification(opts: {
  orderId: string;
  title: string;
  body: string;
  channel?: string;
}): Promise<void> {
  if (Platform.OS !== "android") return;

  await initDriverOrderNotifications();

  await Notifications.scheduleNotificationAsync({
    identifier: `wira-incoming-${opts.orderId}`,
    content: {
      title: opts.title,
      body: opts.body,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        orderId: opts.orderId,
        channel: opts.channel ?? "",
        type: "incoming-order",
      },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function dismissIncomingOrderNotification(orderId: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(`wira-incoming-${orderId}`);
  } catch {
    /* ignore */
  }
}
