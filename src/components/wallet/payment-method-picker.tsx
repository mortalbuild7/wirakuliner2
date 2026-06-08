"use client";

import { formatIdr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CreditCard, Wallet } from "lucide-react";

export type PaymentMethodChoice = "gateway" | "wallet";

type Props = {
  value: PaymentMethodChoice;
  onChange: (v: PaymentMethodChoice) => void;
  walletBalance: number | null;
  total: number;
  disabled?: boolean;
};

export function PaymentMethodPicker({
  value,
  onChange,
  walletBalance,
  total,
  disabled,
}: Props) {
  const canUseWallet = walletBalance != null && walletBalance >= total;

  return (
    <section className="glass-card space-y-3 p-4">
      <p className="text-sm font-medium text-white">Metode pembayaran</p>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
          value === "wallet"
            ? "border-amber-500/50 bg-amber-500/10"
            : "border-white/10 bg-white/5",
          (!canUseWallet || disabled) && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="radio"
          name="payment-method"
          className="mt-1"
          checked={value === "wallet"}
          disabled={!canUseWallet || disabled}
          onChange={() => onChange("wallet")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Wallet className="h-4 w-4 text-amber-400" />
            Saldo WIRA
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {walletBalance == null
              ? "Memuat saldo..."
              : `Tersedia ${formatIdr(walletBalance)}`}
            {!canUseWallet && walletBalance != null ? " — saldo tidak cukup" : ""}
          </p>
        </div>
      </label>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
          value === "gateway"
            ? "border-cyan-500/50 bg-cyan-500/10"
            : "border-white/10 bg-white/5",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="radio"
          name="payment-method"
          className="mt-1"
          checked={value === "gateway"}
          disabled={disabled}
          onChange={() => onChange("gateway")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <CreditCard className="h-4 w-4 text-cyan-400" />
            E-Wallet / VA Bank
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            GoPay, OVO, DANA, ShopeePay, atau Virtual Account
          </p>
        </div>
      </label>
    </section>
  );
}
