"use client";

import { usePathname } from "next/navigation";
import { Bike } from "lucide-react";
import { PoweredByDaffacell } from "@/components/brand/powered-by-daffacell";
import { DriverHeaderControls } from "@/components/driver/driver-header-controls";

export function DriverShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMinimal =
    pathname.startsWith("/driver/setup") || pathname.startsWith("/driver/app-entry");
  const isCockpit = pathname === "/driver" || pathname === "/driver/";

  if (isMinimal) {
    return <div className="wira-mesh min-h-[100dvh]">{children}</div>;
  }

  if (isCockpit) {
    return (
      <div className="wira-mesh flex min-h-[100dvh] flex-col">
        <div className="mx-auto flex w-full max-w-mobile min-h-0 flex-1 flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div className="wira-mesh min-h-[100dvh]">
      <header className="sticky top-0 z-50 border-b border-white/10 glass-panel">
        <div className="mx-auto flex max-w-mobile items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600 shadow-lg">
              <Bike className="h-4 w-4 text-slate-950" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-bold tracking-tight text-white">WIRA Driver</p>
              <PoweredByDaffacell variant="header" className="text-emerald-300/60" />
            </div>
          </div>
          <DriverHeaderControls />
        </div>
      </header>
      <div className="safe-pb-nav mx-auto max-w-mobile">{children}</div>
    </div>
  );
}
