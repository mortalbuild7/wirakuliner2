"use client";

import { Button } from "@/components/ui/button";
import type { DriverStatus } from "@/types/database";
import { DRIVER_STATUS_TOGGLE_LABEL } from "@/lib/driver";
import { Power, Radio, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { value: DriverStatus; icon: typeof Power }[] = [
  { value: "offline", icon: Power },
  { value: "idle", icon: Radio },
  { value: "delivering", icon: Truck },
];

export function DriverStatusToggle({
  status,
  onChange,
  loading,
  lockDelivering,
}: {
  status: DriverStatus;
  onChange: (s: DriverStatus) => void;
  loading?: boolean;
  lockDelivering?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-3 gap-2">
      {OPTIONS.map(({ value, icon: Icon }) => {
        const active = status === value;
        const disabled =
          loading ||
          (lockDelivering && status === "delivering" && value !== "delivering");
        const label = DRIVER_STATUS_TOGGLE_LABEL[value];

        return (
          <Button
            key={value}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(value)}
            className={cn(
              "driver-touch-btn h-auto min-h-[4.25rem] min-w-0 flex-col gap-1 rounded-2xl border-slate-200 bg-white px-1.5 py-2.5 text-slate-700",
              active &&
                "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-md shadow-emerald-500/10"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                active ? "text-emerald-700" : "text-slate-500"
              )}
            />
            <span className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5 text-center leading-tight">
              <span
                className={cn(
                  "block w-full truncate text-[11px] font-bold",
                  active ? "text-emerald-900" : "text-slate-800"
                )}
              >
                {label.title}
              </span>
              {label.subtitle ? (
                <span
                  className={cn(
                    "block w-full truncate text-[9px] font-semibold uppercase tracking-wide",
                    active ? "text-emerald-700/90" : "text-slate-500"
                  )}
                >
                  {label.subtitle}
                </span>
              ) : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
