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
        "relative flex gap-3 rounded-lg border p-4",
        variant === "destructive" && "border-destructive/50 bg-destructive/10 text-destructive",
        variant === "warning" && "border-amber-300 bg-amber-50 text-amber-900",
        variant === "default" && "border-border bg-muted/50",
        className
      )}
      {...props}
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <div className="text-sm">{children}</div>
    </div>
  );
}
