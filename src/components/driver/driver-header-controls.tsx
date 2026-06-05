"use client";

import { useEffect } from "react";
import { useDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverStatusActions } from "@/hooks/use-driver-status-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, LogOut, Power } from "lucide-react";

function postNativeMessage(payload: Record<string, unknown>) {
  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (rn) {
    rn.postMessage(JSON.stringify(payload));
  }
}

export function DriverHeaderControls() {
  const { driver, loading: profileLoading, refresh } = useDriverProfile();
  const { loading, isOnline, isDelivering, setOnline, logout } = useDriverStatusActions(
    driver,
    refresh
  );

  useEffect(() => {
    postNativeMessage({
      type: "WIRA_DRIVER_STATE",
      online: isOnline,
      delivering: isDelivering,
      hasDriver: Boolean(driver),
    });
  }, [isOnline, isDelivering, driver]);

  if (profileLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />;
  }

  if (!driver) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground"
        onClick={() => logout()}
        disabled={loading}
      >
        <LogOut className="mr-1 h-3.5 w-3.5" />
        Keluar
      </Button>
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

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={loading || (isDelivering && isOnline)}
        onClick={toggleOnline}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
          isOnline
            ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
            : "border-slate-500/50 bg-slate-700/40 text-slate-300",
          (loading || (isDelivering && isOnline)) && "opacity-60"
        )}
        aria-pressed={isOnline}
      >
        <Power className="h-3.5 w-3.5" />
        {loading ? "..." : isOnline ? "ON" : "OFF"}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs text-muted-foreground hover:text-red-300"
        onClick={() => logout()}
        disabled={loading}
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
