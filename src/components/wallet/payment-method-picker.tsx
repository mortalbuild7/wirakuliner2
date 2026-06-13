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
      <p className="text-sm font-bold text-slate-900">Metode pembayaran</p>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
          value === "wallet"
            ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30"
            : "border-slate-200 bg-white hover:border-slate-300",
          (!canUseWallet || disabled) && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="radio"
          name="payment-method"
          className="mt-1 accent-emerald-600"
          checked={value === "wallet"}
          disabled={!canUseWallet || disabled}
          onChange={() => onChange("wallet")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 text-emerald-700" />
            Saldo WIRA
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            {walletBalance == null
              ? "Memuat saldo..."
              : `Tersedia ${formatIdr(walletBalance)}`}
            {!canUseWallet && walletBalance != null ? " — saldo tidak cukup" : ""}
          </p>
        </div>
      </label>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition",
          value === "gateway"
            ? "border-sky-600 bg-sky-50 ring-1 ring-sky-600/30"
            : "border-slate-200 bg-white hover:border-slate-300",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="radio"
          name="payment-method"
          className="mt-1 accent-sky-600"
          checked={value === "gateway"}
          disabled={disabled}
          onChange={() => onChange("gateway")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CreditCard className="h-4 w-4 text-sky-700" />
            E-Wallet / VA Bank
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            GoPay, OVO, DANA, ShopeePay, atau Virtual Account
          </p>
        </div>
      </label>
    </section>
  );
}
