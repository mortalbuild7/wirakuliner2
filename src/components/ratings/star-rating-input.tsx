"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function StarRatingInput({ value, onChange, disabled, size = "md" }: Props) {
  const iconClass = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating bintang">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            "rounded p-0.5 transition hover:scale-110 disabled:opacity-50",
            star <= value ? "text-amber-400" : "text-white/25"
          )}
          aria-label={`${star} bintang`}
          aria-checked={star === value}
        >
          <Star className={cn(iconClass, star <= value && "fill-amber-400")} />
        </button>
      ))}
    </div>
  );
}

export function StarRatingDisplay({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const rounded = Math.round(value);
  const iconClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              iconClass,
              star <= rounded ? "fill-amber-400 text-amber-400" : "text-white/20"
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {value > 0 ? value.toFixed(1) : "—"}
        {count != null ? ` (${count})` : ""}
      </span>
    </div>
  );
}
