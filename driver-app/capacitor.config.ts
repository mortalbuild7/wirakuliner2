import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.WIRA_DRIVER_SERVER_URL ?? "https://www.wirakuliner.web.id/driver";

const config: CapacitorConfig = {
  appId: "id.web.wirakuliner.driver",
  appName: "WIRA Driver",
  webDir: "www",
  server: {
    url: serverUrl,
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Geolocation: {
      enableHighAccuracy: true,
    },
  },
};

export default config;
