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
  /** Saat sedang antar, jangan izinkan offline/idle */
  lockDelivering?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
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
              "h-auto flex-col gap-1 rounded-2xl border-white/10 py-3 text-[10px]",
              active && "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
            )}
          >
            <Icon className="h-4 w-4" />
            {DRIVER_STATUS_LABEL[value]}
          </Button>
        );
      })}
    </div>
  );
}
