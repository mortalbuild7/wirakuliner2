"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Loader2, Smartphone, Building2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";
import { WalletWithdrawPanel } from "@/components/wallet/wallet-withdraw-panel";
import { cn } from "@/lib/utils";
import {
  createQrisPayment,
  isPaymentBypassEnabled,
} from "@/lib/payment-flow";
import {
  QrisPaymentPanel,
  type QrisPaymentData,
} from "@/components/payment/qris-payment-panel";

const PRESETS = [50_000, 100_000, 200_000, 500_000];

type Tab = "topup" | "withdraw";
type StubMethod = "ewallet" | "va_bank";

export default function CustomerWalletPage() {
  const bypass = isPaymentBypassEnabled();
  const [tab, setTab] = useState<Tab>("topup");
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("100000");
  const [stubMethod, setStubMethod] = useState<StubMethod>("ewallet");
  const [payment, setPayment] = useState<QrisPaymentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    const res = await fetch("/api/wallet/me", { credentials: "include" });
    if (!res.ok) return;
    const json = (await res.json()) as { balance?: number };
    if (typeof json.balance === "number") setBalance(json.balance);
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  async function topup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setPayment(null);

    const nominal = Number(amount.replace(/\D/g, ""));
    if (!Number.isFinite(nominal) || nominal < 10_000) {
      setError("Minimal top up Rp 10.000");
      setLoading(false);
      return;
    }
    if (nominal > 10_000_000) {
      setError("Maksimal top up Rp 10.000.000");
      setLoading(false);
      return;
    }

    try {
      if (!bypass) {
        const midtrans = await createQrisPayment({ type: "topup", amount: nominal });
        setPayment(midtrans);
        return;
      }

      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: nominal,
          method: stubMethod,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        balance?: number;
      };
      if (!res.ok) {
        setError(json.error ?? "Gagal top up");
        return;
      }
      setSuccess(json.message ?? "Top up berhasil");
      if (typeof json.balance === "number") setBalance(json.balance);
      else await loadBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-5 px-4 py-4">
      <div className="flex items-center gap-3">
        <Link
          href="/customer"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Saldo WIRA</h1>
          <p className="text-xs text-muted-foreground">Top up, tarik & bayar pesanan</p>
        </div>
      </div>

      <section className="glass-card overflow-hidden p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600">
            <Wallet className="h-6 w-6 text-white" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Saldo tersedia</p>
            <p className="text-2xl font-bold text-white">
              {balance == null ? "—" : formatIdr(balance)}
            </p>
          </div>
        </div>
      </section>

      <div className="flex gap-2 rounded-2xl border border-white/10 p-1">
        {(["topup", "withdraw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
              setSuccess(null);
              setPayment(null);
            }}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-medium transition",
              tab === t
                ? "bg-amber-500/25 text-amber-200"
                : "text-muted-foreground hover:text-white"
            )}
          >
            {t === "topup" ? "Top up" : "Tarik saldo"}
          </button>
        ))}
      </div>

      {tab === "withdraw" ? (
        <WalletWithdrawPanel balance={balance} onBalanceChange={setBalance} />
      ) : (
        <>
          {error && <Alert variant="destructive">{error}</Alert>}
          {success && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
              {success}
            </Alert>
          )}

          <form onSubmit={topup} className="glass-card space-y-4 p-4">
            <p className="text-sm font-medium text-white">Top up saldo</p>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white transition hover:border-amber-500/40"
                >
                  {formatIdr(p)}
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="topup-amount">Nominal (Rp)</Label>
              <Input
                id="topup-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="100000"
                required
              />
            </div>

            {bypass ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStubMethod("ewallet")}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs ${
                    stubMethod === "ewallet"
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 text-muted-foreground"
                  }`}
                >
                  <Smartphone className="h-5 w-5" />
                  E-Wallet (uji)
                </button>
                <button
                  type="button"
                  onClick={() => setStubMethod("va_bank")}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs ${
                    stubMethod === "va_bank"
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 text-muted-foreground"
                  }`}
                >
                  <Building2 className="h-5 w-5" />
                  VA Bank (uji)
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                Pembayaran via <strong>Midtrans</strong> — QRIS, GoPay, transfer
                bank, dan metode lain sesuai kanal yang aktif di akun merchant Anda.
                Saldo dikredit otomatis setelah pembayaran berhasil.
              </div>
            )}

            <Button type="submit" disabled={loading || Boolean(payment)} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : bypass ? (
                "Top up sekarang (mode uji)"
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Bayar top up via Midtrans
                </>
              )}
            </Button>
          </form>

          {payment && (
            <QrisPaymentPanel
              data={payment}
              title="Top up saldo — Midtrans"
              onPaid={async () => {
                setPayment(null);
                setSuccess("Top up berhasil — saldo telah diperbarui");
                await loadBalance();
              }}
              onCancel={() => setPayment(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
