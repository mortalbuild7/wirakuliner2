import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, Store } from "lucide-react";
import { isStoreOpen } from "@/lib/merchant-open";
import type { Merchant } from "@/types/database";

export function StoreStatusBadge({
  merchant,
  className,
}: {
  merchant: Pick<Merchant, "is_open">;
  className?: string;
}) {
  const open = isStoreOpen(merchant);
  return (
    <Badge
      className={cn(
        "gap-1 border-0 text-[10px] font-semibold backdrop-blur",
        open ? "bg-emerald-500/90 text-white" : "bg-slate-600/90 text-slate-200",
        className
      )}
    >
      {open ? (
        <>
          <Store className="h-3 w-3" /> Buka
        </>
      ) : (
        <>
          <Clock className="h-3 w-3" /> Tutup
        </>
      )}
    </Badge>
  );
}
