import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export function Alert({
  className,
  variant = "default",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" | "warning" }) {
  return (
    <div
      role="alert"
      className={cn(
        "relative flex gap-3 rounded-2xl border p-4 shadow-sm",
        variant === "destructive" &&
          "border-red-200/80 bg-red-50 text-red-800",
        variant === "warning" &&
          "border-amber-200/80 bg-amber-50 text-amber-900",
        variant === "default" &&
          "border-slate-200/80 bg-white text-slate-700",
        className
      )}
      {...props}
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <div className="text-sm">{children}</div>
    </div>
  );
}
