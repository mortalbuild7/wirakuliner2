import { POWERED_BY, POWERED_BY_INSPECT, POWERED_BY_LABEL, POWERED_BY_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

type Props = {
  /** Header customer: teks sangat kecil di samping logo */
  variant?: "header" | "footer" | "hidden";
  className?: string;
};

/** Kredit DAFFACELL — tampil di UI + metadata untuk inspect element */
export function PoweredByDaffacell({ variant = "footer", className }: Props) {
  if (variant === "hidden") {
    return (
      <div
        className="sr-only"
        aria-hidden
        data-powered-by={POWERED_BY}
        data-vendor={POWERED_BY_URL}
        data-engineering-credit={POWERED_BY_INSPECT}
        suppressHydrationWarning
      >
        {POWERED_BY_INSPECT}
      </div>
    );
  }

  if (variant === "header") {
    return (
      <span
        className={cn(
          "text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground/70",
          className
        )}
        data-powered-by={POWERED_BY}
        title={POWERED_BY_INSPECT}
      >
        {POWERED_BY_LABEL}
      </span>
    );
  }

  return (
    <p
      className={cn("text-center text-[10px] text-muted-foreground/60", className)}
      data-powered-by={POWERED_BY}
    >
      {POWERED_BY_LABEL}
    </p>
  );
}
