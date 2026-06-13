"use client";

import { usePathname } from "next/navigation";
import { Bike } from "lucide-react";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";
import { DriverHeaderControls } from "@/components/driver/driver-header-controls";
import { HelloWelcome } from "@/components/shared/HelloWelcome";
import { DriverApkBottomBar, useDriverApkWebView } from "@/components/driver/driver-apk-bottom-bar";
import { cn } from "@/lib/utils";

export function DriverShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isApk = useDriverApkWebView();
  const isMinimal =
    pathname.startsWith("/driver/setup") || pathname.startsWith("/driver/app-entry");
  const isCockpit = pathname === "/driver" || pathname === "/driver/";

  if (isMinimal) {
    return <div className="driver-panel wira-mesh min-h-[100dvh]">{children}</div>;
  }

  if (isCockpit) {
    return (
      <div className="driver-panel wira-mesh flex min-h-[100dvh] flex-col">
        <HelloWelcome />
        <div
          className={cn(
            "mx-auto flex w-full max-w-mobile min-h-0 flex-1 flex-col",
            isApk && "pb-[calc(5.75rem+max(env(safe-area-inset-bottom,0px),8px))]"
          )}
        >
          {children}
        </div>
        <DriverApkBottomBar />
      </div>
    );
  }

  return (
    <div className="driver-panel wira-mesh min-h-[100dvh]">
      <HelloWelcome />
      <header className="sticky top-0 z-50 glass-panel">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-500 shadow-lg shadow-amber-400/25">
              <Bike className="h-5 w-5 text-white" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-bold tracking-tight text-slate-800">WIRA Driver</p>
              <PoweredByDaffacell variant="header" className="text-slate-500" />
            </div>
          </div>
          {!isApk && <DriverHeaderControls />}
        </div>
      </header>
      <div className={cn("safe-pb-nav mx-auto max-w-mobile", isApk && "pb-[calc(5.75rem+max(env(safe-area-inset-bottom,0px),8px))]")}>
        {children}
      </div>
      <DriverApkBottomBar />
    </div>
  );
}
