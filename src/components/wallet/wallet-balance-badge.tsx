"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatIdr } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  href?: string;
  className?: string;
  refreshKey?: number;
};

export function WalletBalanceBadge({ href, className, refreshKey = 0 }: Props) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { balance?: number } | null) => {
        if (!cancelled && j && typeof j.balance === "number") {
          setBalance(j.balance);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const inner = (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200",
        className
      )}
      title="Saldo WIRA"
    >
      <Wallet className="h-3 w-3 shrink-0" />
      <span>{balance == null ? "Saldo" : formatIdr(balance)}</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0">
        {inner}
      </Link>
    );
  }

  return inner;
}
