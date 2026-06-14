import Link from "next/link";
import { Bike, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExploreSection = "etalase" | "ngojek";

/** Navigasi Jelajah — kontras tinggi, ramah WCAG. */
export function CustomerExploreNav({ active }: { active: ExploreSection }) {
  return (
    <nav
      aria-label="Jelajah WIRA"
      className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
        <Link
          href="/customer"
          prefetch
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-3.5 transition",
            active === "etalase"
              ? "bg-white text-slate-900 shadow-md ring-2 ring-cyan-600"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Store
              className={cn("h-5 w-5", active === "etalase" ? "text-cyan-700" : "text-slate-700")}
              aria-hidden
            />
            Etalase
          </span>
          <span className="text-[10px] font-semibold text-slate-600">Makanan & toko</span>
        </Link>
        <Link
          href="/customer/ride"
          prefetch
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-3.5 transition",
            active === "ngojek"
              ? "bg-white text-slate-900 shadow-md ring-2 ring-emerald-600"
              : "text-slate-600 hover:bg-white hover:text-slate-900"
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Bike
              className={cn("h-5 w-5", active === "ngojek" ? "text-emerald-700" : "text-slate-700")}
              aria-hidden
            />
            WIRA Ride
          </span>
          <span className="text-[10px] font-semibold text-slate-600">NGOJEK · Mobil · Paket</span>
        </Link>
      </div>
    </nav>
  );
}
