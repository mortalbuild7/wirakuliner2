"use client";

import { useEffect, useState } from "react";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverStatusActions } from "@/hooks/use-driver-status-actions";
import { cn } from "@/lib/utils";
import { Loader2, LogOut, Power } from "lucide-react";

function detectApkWebView(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    ReactNativeWebView?: unknown;
    __WIRA_APK_WEBVIEW__?: boolean;
  };
  return Boolean(w.__WIRA_APK_WEBVIEW__ || w.ReactNativeWebView);
}

function postNativeMessage(payload: Record<string, unknown>) {
  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  rn?.postMessage(JSON.stringify(payload));
}

export function useDriverApkWebView(): boolean {
  const [isApk, setIsApk] = useState(detectApkWebView);

  useEffect(() => {
    setIsApk(detectApkWebView());
    const timer = window.setInterval(() => {
      if (detectApkWebView()) {
        setIsApk(true);
        window.clearInterval(timer);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  return isApk;
}

/** Bottom Panel Status — latar putih solid (bukan menu navigasi). */
function DriverBottomStatusPanel({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <nav
      aria-label="Status driver"
      className={cn(
        "driver-apk-bottom-bar fixed bottom-0 left-0 right-0 z-[80]",
        "border-t border-gray-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)]",
        loading && "opacity-90"
      )}
      style={{ backgroundColor: "#ffffff" }}
    >
      <div
        className="bg-white pb-[max(env(safe-area-inset-bottom,0px),8px)]"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="mx-auto flex max-w-mobile items-center gap-2.5 px-3 py-2.5">
          {children}
        </div>
      </div>
    </nav>
  );
}

/** Panel bawah APK: switch ONLINE/OFF + tombol Keluar — background putih bersih. */
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

  if (!isApk) return null;

  if (profileLoading) {
    return (
      <DriverBottomStatusPanel loading>
        <div className="min-h-[3.25rem] flex-1 animate-pulse rounded-2xl bg-slate-100" />
        <div className="min-h-[3.25rem] w-[5.5rem] shrink-0 animate-pulse rounded-2xl bg-slate-100" />
      </DriverBottomStatusPanel>
    );
  }

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

  const toggleDisabled = loading || (isDelivering && isOnline);

  return (
    <DriverBottomStatusPanel>
      <button
        type="button"
        disabled={toggleDisabled}
        onClick={() => void toggleOnline()}
        className={cn(
          "min-h-[3.25rem] flex-1 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98]",
          isOnline
            ? "border-emerald-400 bg-emerald-50"
            : "border-slate-200 bg-slate-50",
          toggleDisabled && "opacity-70"
        )}
        aria-pressed={isOnline}
      >
        <span className="flex items-center gap-2">
          <Power
            className={cn(
              "h-4 w-4 shrink-0",
              isOnline ? "text-emerald-600" : "text-slate-500"
            )}
          />
          <span
            className={cn(
              "text-sm font-bold",
              isOnline ? "text-emerald-800" : "text-slate-800"
            )}
          >
            {loading ? "Memuat..." : isOnline ? "● ONLINE" : "○ OFFLINE"}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 block pl-6 text-[10px] font-medium",
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
        className="flex min-h-[3.25rem] shrink-0 items-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-600 transition active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-red-600" />
        ) : (
          <LogOut className="h-4 w-4 text-red-600" />
        )}
        <span className="text-red-600">Keluar</span>
      </button>
    </DriverBottomStatusPanel>
  );
}
