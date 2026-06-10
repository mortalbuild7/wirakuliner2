"use client";

import { useCallback, useState, useTransition } from "react";
import { recordAppWithdrawal } from "@/app/actions/adminFinanceActions";
import type {
  AppWithdrawalRow,
  FinanceSummary,
  FinancialLogRow,
} from "@/lib/app-finance";
import { formatIdr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2, Wallet, TrendingUp, Utensils } from "lucide-react";

type Props = {
  initialSummary: FinanceSummary;
  initialLogs: FinancialLogRow[];
  initialWithdrawals: AppWithdrawalRow[];
};

function maskAmount(visible: boolean, amount: number): string {
  return visible ? formatIdr(amount) : "Rp *****";
}

export function FinanceDashboard({
  initialSummary,
  initialLogs,
  initialWithdrawals,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [logs, setLogs] = useState(initialLogs);
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [note, setNote] = useState("");

  const loadCashflow = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/admin/finance/cashflow?${params}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        logs?: FinancialLogRow[];
        error?: string;
      };
      if (!res.ok) {
        setFormError(json.error ?? "Gagal memuat cashflow");
        return;
      }
      setLogs(json.logs ?? []);
    } finally {
      setLoadingLogs(false);
    }
  }, [dateFrom, dateTo]);

  function submitWithdrawal() {
    setFormError(null);
    setFormSuccess(null);

    startTransition(async () => {
      const result = await recordAppWithdrawal({
        amount,
        bankName,
        accountNumber,
        accountHolder,
        note,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setFormSuccess(result.message ?? "Berhasil");
      if (result.balanceAfter !== undefined) {
        setSummary((s) => ({ ...s, ledgerBalance: result.balanceAfter! }));
      }
      setWithdrawals((prev) => [
        {
          id: crypto.randomUUID(),
          amount: Number(amount),
          bank_name: bankName,
          account_number: accountNumber,
          account_holder: accountHolder,
          note: note || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setAmount("");
      setBankName("");
      setAccountNumber("");
      setAccountHolder("");
      setNote("");
    });
  }

  const cards = [
    {
      label: "Komisi Transport (10%)",
      value: summary.transportCommission,
      icon: TrendingUp,
      color: "text-blue-600",
    },
    {
      label: "Markup Merchant (Rp1.000/item)",
      value: summary.merchantMarkup,
      icon: Utensils,
      color: "text-amber-600",
    },
    {
      label: "Grand Total Pendapatan",
      value: summary.grandTotal,
      icon: Wallet,
      color: "text-emerald-600",
    },
    {
      label: "Saldo Internal (siap ditarik)",
      value: summary.ledgerBalance,
      icon: Wallet,
      color: "text-violet-600",
      highlight: true,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Keuangan Aplikasi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buku besar pendapatan platform — hanya SUPER_ADMIN
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan nominal" : "Tampilkan nominal"}
        >
          {visible ? (
            <EyeOff className="mr-2 h-4 w-4" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          {visible ? "Sembunyikan" : "Tampilkan"} saldo
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`rounded-xl border p-4 ${
                c.highlight ? "border-violet-300 bg-violet-50/50" : "bg-card"
              }`}
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className={`h-4 w-4 ${c.color}`} />
                {c.label}
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {maskAmount(visible, c.value)}
              </p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Buku Besar / Cashflow</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Audit trail mutasi IN/OUT saldo internal aplikasi
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from">Dari tanggal</Label>
            <Input
              id="from"
              type="date"
              className="mt-1 w-40"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">Sampai tanggal</Label>
            <Input
              id="to"
              type="date"
              className="mt-1 w-40"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loadingLogs}
            onClick={() => void loadCashflow()}
          >
            {loadingLogs ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Filter
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setLogs(initialLogs);
            }}
          >
            Reset
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Waktu</th>
                <th className="py-2 pr-4">Tipe</th>
                <th className="py-2 pr-4 text-right">Nominal</th>
                <th className="py-2 pr-4 text-right">Saldo setelah</th>
                <th className="py-2">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        row.type === "IN"
                          ? "font-medium text-emerald-600"
                          : "font-medium text-red-600"
                      }
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {visible ? formatIdr(Number(row.amount)) : "Rp *****"}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {visible
                      ? formatIdr(Number(row.balance_after))
                      : "Rp *****"}
                  </td>
                  <td className="py-2 text-muted-foreground">{row.description}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Belum ada mutasi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Catat Penarikan Dana ke Bank</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mencatat pemindahan dari penampung digital (Midtrans) ke rekening bank
          perusahaan — mengurangi saldo internal aplikasi
        </p>

        {formError && (
          <Alert variant="destructive" className="mt-4 max-w-xl">
            {formError}
          </Alert>
        )}
        {formSuccess && (
          <Alert className="mt-4 max-w-xl border-emerald-500/40 bg-emerald-500/10 text-emerald-900">
            {formSuccess}
          </Alert>
        )}

        <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="wd-amount">Nominal (Rp)</Label>
            <Input
              id="wd-amount"
              type="number"
              min={1}
              className="mt-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
            />
          </div>
          <div>
            <Label htmlFor="wd-bank">Nama Bank</Label>
            <Input
              id="wd-bank"
              className="mt-1"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="BCA"
            />
          </div>
          <div>
            <Label htmlFor="wd-acc">Nomor Rekening</Label>
            <Input
              id="wd-acc"
              className="mt-1"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="1234567890"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wd-holder">Nama Pemilik Rekening</Label>
            <Input
              id="wd-holder"
              className="mt-1"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wd-note">Catatan (opsional)</Label>
            <Input
              id="wd-note"
              className="mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <Button
          className="mt-4"
          disabled={pending}
          onClick={() => submitWithdrawal()}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Catat Penarikan Dana ke Bank
        </Button>

        {withdrawals.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <h3 className="text-sm font-medium text-muted-foreground">
              Riwayat penarikan terbaru
            </h3>
            <table className="mt-2 w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Waktu</th>
                  <th className="py-2 pr-4 text-right">Nominal</th>
                  <th className="py-2 pr-4">Bank</th>
                  <th className="py-2">Pemilik</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.slice(0, 10).map((w) => (
                  <tr key={w.id} className="border-b">
                    <td className="py-2 pr-4">
                      {new Date(w.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {visible ? formatIdr(Number(w.amount)) : "Rp *****"}
                    </td>
                    <td className="py-2 pr-4">{w.bank_name}</td>
                    <td className="py-2">{w.account_holder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
