"use client";

import { useEffect, useState } from "react";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverStatusActions } from "@/hooks/use-driver-status-actions";
import { cn } from "@/lib/utils";
import { Loader2, LogOut } from "lucide-react";

function postNativeMessage(payload: Record<string, unknown>) {
  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(payload));
}

export function useDriverApkWebView(): boolean {
  const [isApk, setIsApk] = useState(false);
  useEffect(() => {
    setIsApk(Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView));
  }, []);
  return isApk;
}

/** Toolbar bawah putih di WebView APK — menggantikan native bar gelap di shell Expo. */
export function DriverApkBottomBar() {
  const isApk = useDriverApkWebView();
  const { driver, loading: profileLoading, refresh } = useDriverProfile();
  const { loading, isOnline, isDelivering, setOnline, logout } = useDriverStatusActions(
    driver,
    refresh
  );

  useEffect(() => {
    if (!isApk) return;
    postNativeMessage({
      type: "WIRA_DRIVER_STATE",
      online: isOnline,
      delivering: isDelivering,
      hasDriver: Boolean(driver),
    });
  }, [isApk, isOnline, isDelivering, driver]);

  if (!isApk || profileLoading) return null;

  async function toggleOnline() {
    if (isDelivering && isOnline) {
      alert("Sedang mengantar — tidak bisa dimatikan.");
      return;
    }
    const ok = await setOnline(!isOnline);
    if (ok) {
      postNativeMessage({ type: "WIRA_DRIVER_TOGGLED", online: !isOnline });
    }
  }

  const statusHint = isDelivering
    ? "Mengantar"
    : isOnline
      ? "Siap terima order"
      : "Tidak menerima order";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-200/90 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_24px_rgb(0,0,0,0.04)]">
      <div className="mx-auto flex max-w-mobile items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          disabled={loading || (isDelivering && isOnline)}
          onClick={() => void toggleOnline()}
          className={cn(
            "min-h-[3.25rem] flex-1 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98]",
            isOnline
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-slate-50",
            (loading || (isDelivering && isOnline)) && "opacity-70"
          )}
          aria-pressed={isOnline}
        >
          <span
            className={cn(
              "block text-sm font-bold",
              isOnline ? "text-emerald-800" : "text-slate-800"
            )}
          >
            {loading ? "Memuat..." : isOnline ? "● ONLINE" : "○ OFFLINE"}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[10px] font-medium",
              isOnline ? "text-emerald-700" : "text-slate-600"
            )}
          >
            {statusHint}
          </span>
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void logout()}
          className="flex min-h-[3.25rem] shrink-0 items-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Keluar
        </button>
      </div>
    </nav>
  );
}
