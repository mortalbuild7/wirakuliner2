/** Deteksi & load Capacitor hanya di client native (APK) */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}
