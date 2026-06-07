"use client";

import { Bike, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExploreTab = "etalase" | "ngojek";

export function CustomerExploreTabs({
  active,
  onChange,
}: {
  active: ExploreTab;
  onChange: (tab: ExploreTab) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/15 bg-slate-900/80 p-1.5 shadow-lg">
      <button
        type="button"
        onClick={() => onChange("etalase")}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-3.5 transition",
          active === "etalase"
            ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/30"
            : "text-muted-foreground hover:bg-white/5 hover:text-white"
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Store className="h-5 w-5" />
          Etalase
        </span>
        <span
          className={cn(
            "text-[10px] font-medium",
            active === "etalase" ? "text-slate-800/80" : "text-muted-foreground"
          )}
        >
          Makanan & toko
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("ngojek")}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-3.5 transition",
          active === "ngojek"
            ? "bg-gradient-to-r from-emerald-500 to-green-400 text-slate-950 shadow-lg shadow-emerald-500/30"
            : "text-muted-foreground hover:bg-white/5 hover:text-white"
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Bike className="h-5 w-5" />
          NGOJEK
        </span>
        <span
          className={cn(
            "text-[10px] font-medium",
            active === "ngojek" ? "text-slate-800/80" : "text-muted-foreground"
          )}
        >
          Ojek online
        </span>
      </button>
    </div>
  );
}
