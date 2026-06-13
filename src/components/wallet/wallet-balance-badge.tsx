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
        "flex items-center gap-1.5 rounded-full border border-emerald-700/30 bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm",
        className
      )}
      title="Saldo WIRA"
    >
      <Wallet className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden />
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
