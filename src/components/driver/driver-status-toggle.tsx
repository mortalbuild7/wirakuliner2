"use client";

import { Button } from "@/components/ui/button";
import type { DriverStatus } from "@/types/database";
import { DRIVER_STATUS_LABEL } from "@/lib/driver";
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
    <div className="grid grid-cols-3 gap-2.5">
      {OPTIONS.map(({ value, icon: Icon }) => {
        const active = status === value;
        const disabled =
          loading ||
          (lockDelivering && status === "delivering" && value !== "delivering");
        return (
          <Button
            key={value}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(value)}
            className={cn(
              "driver-touch-btn h-auto min-h-[3.5rem] flex-col gap-1.5 rounded-2xl border-slate-200/80 bg-white py-3.5 text-xs font-semibold text-slate-600",
              active &&
                "border-emerald-400/60 bg-emerald-50 text-emerald-800 shadow-lg shadow-emerald-500/15"
            )}
          >
            <Icon className="h-5 w-5" />
            {DRIVER_STATUS_LABEL[value]}
          </Button>
        );
      })}
    </div>
  );
}
