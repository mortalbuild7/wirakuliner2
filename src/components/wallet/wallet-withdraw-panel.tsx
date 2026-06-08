"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Loader2, Smartphone, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";

type WithdrawRow = {
  id: string;
  amount: number;
  method: string;
  destination: string;
  destination_name: string | null;
  status: string;
  created_at: string;
};

type Props = {
  balance: number | null;
  onBalanceChange?: (balance: number) => void;
  /** Fetch dengan Bearer token driver (APK) */
  driverMode?: boolean;
  className?: string;
};

const PRESETS = [50_000, 100_000, 200_000, 500_000];

export function WalletWithdrawPanel({
  balance,
  onBalanceChange,
  driverMode = false,
  className,
}: Props) {
  const [amount, setAmount] = useState("100000");
  const [method, setMethod] = useState<"ewallet" | "va_bank">("ewallet");
  const [destination, setDestination] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<WithdrawRow[]>([]);
  const [expanded, setExpanded] = useState(false);

  const baseFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (driverMode) {
        const { fetchWithDriverAuth } = await import("@/lib/driver-native-session");
        return fetchWithDriverAuth(url, init);
      }
      return fetch(url, { credentials: "include", ...init });
    },
    [driverMode]
  );

  const loadHistory = useCallback(async () => {
    const res = await baseFetch("/api/wallet/withdrawals");
    if (!res.ok) return;
    const json = (await res.json()) as { withdrawals?: WithdrawRow[] };
    setHistory(json.withdrawals ?? []);
  }, [baseFetch]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const nominal = Number(amount.replace(/\D/g, ""));
    if (!Number.isFinite(nominal) || nominal < 50_000) {
      setError("Minimal penarikan Rp 50.000");
      setLoading(false);
      return;
    }
    if (balance != null && nominal > balance) {
      setError("Saldo tidak mencukupi");
      setLoading(false);
      return;
    }

    try {
      const res = await baseFetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: nominal,
          method,
          destination: destination.trim(),
          destinationName: destinationName.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        balance?: number;
      };
      if (!res.ok) {
        setError(json.error ?? "Gagal menarik saldo");
        return;
      }
      setSuccess(json.message ?? "Penarikan berhasil");
      if (typeof json.balance === "number") onBalanceChange?.(json.balance);
      setDestination("");
      setDestinationName("");
      await loadHistory();
    } catch {
      setError("Koneksi gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      {error && (
        <Alert variant="destructive" className="mb-3">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mb-3 border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
          {success}
        </Alert>
      )}

      <form onSubmit={withdraw} className="glass-card space-y-4 p-4">
        {driverMode ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-white"
            aria-expanded={expanded}
          >
            <span className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-amber-400" />
              Tarik saldo
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <ArrowDownToLine className="h-4 w-4 text-amber-400" />
            Tarik saldo
          </p>
        )}

        {(!driverMode || expanded) && balance != null && (
          <p className="text-xs text-muted-foreground">
            Saldo tersedia: <span className="text-white">{formatIdr(balance)}</span>
          </p>
        )}

        {(!driverMode || expanded) && (
        <>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={balance != null && p > balance}
              onClick={() => setAmount(String(p))}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white transition hover:border-amber-500/40 disabled:opacity-40"
            >
              {formatIdr(p)}
            </button>
          ))}
        </div>

        <div>
          <Label htmlFor="withdraw-amount">Nominal tarik (Rp)</Label>
          <Input
            id="withdraw-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="100000"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("ewallet")}
            className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs ${
              method === "ewallet"
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            <Smartphone className="h-5 w-5" />
            E-Wallet
          </button>
          <button
            type="button"
            onClick={() => setMethod("va_bank")}
            className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs ${
              method === "va_bank"
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            <Building2 className="h-5 w-5" />
            Rekening Bank
          </button>
        </div>

        {method === "ewallet" ? (
          <div>
            <Label htmlFor="withdraw-ewallet">Nomor E-Wallet</Label>
            <Input
              id="withdraw-ewallet"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="08xxxxxxxxxx / ID GoPay/OVO/DANA"
              required
            />
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="withdraw-bank-name">Nama bank / pemilik rekening</Label>
              <Input
                id="withdraw-bank-name"
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
                placeholder="BCA — Budi Santoso"
              />
            </div>
            <div>
              <Label htmlFor="withdraw-account">Nomor rekening</Label>
              <Input
                id="withdraw-account"
                inputMode="numeric"
                value={destination}
                onChange={(e) => setDestination(e.target.value.replace(/\s/g, ""))}
                placeholder="1234567890"
                required
              />
            </div>
          </>
        )}

        <Button type="submit" disabled={loading} variant="outline" className="w-full border-amber-500/40">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memproses...
            </>
          ) : (
            "Tarik saldo sekarang"
          )}
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Minimal Rp 50.000. Dana diproses ke tujuan dalam 1×24 jam (mode uji: langsung dipotong
          dari saldo).
        </p>
        </>
        )}
      </form>

      {(!driverMode || expanded) && history.length > 0 && (
        <section className="glass-card mt-4 p-4">
          <p className="text-sm font-medium text-white">Riwayat penarikan</p>
          <ul className="mt-3 space-y-2">
            {history.slice(0, 5).map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 text-xs last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{formatIdr(Number(w.amount))}</p>
                  <p className="truncate text-muted-foreground">
                    {w.method === "ewallet" ? "E-Wallet" : "Bank"} · {w.destination}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-emerald-400/90 capitalize">
                  {w.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
