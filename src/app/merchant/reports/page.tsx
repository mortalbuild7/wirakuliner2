"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SalesReportDocument } from "@/components/merchant/sales-report-document";
import { printSalesReport } from "@/lib/print";
import { REPORT_PERIOD_LABELS, type ReportPeriod, type SalesReportData } from "@/lib/sales-report";
import { formatIdr } from "@/lib/utils";
import { BarChart3, Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIODS: ReportPeriod[] = ["today", "7d", "30d", "365d"];

export default function MerchantReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/reports?period=${period}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        report?: SalesReportData;
      };

      if (!res.ok || !json.report) {
        setError(json.error ?? "Gagal memuat laporan");
        return;
      }

      setReport(json.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-orange-400">
            <BarChart3 className="h-3.5 w-3.5" /> Laporan
          </p>
          <h1 className="text-xl font-bold text-white md:text-2xl">Penjualan</h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan omzet — cetak laporan A4 (bukan struk thermal)
          </p>
        </div>
        <Button
          className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-slate-950"
          disabled={!report || loading}
          onClick={() => printSalesReport()}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print laporan
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              period === p
                ? "bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/40"
                : "border border-white/10 bg-white/5 text-muted-foreground hover:text-white"
            )}
          >
            {REPORT_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
          Memuat laporan...
        </div>
      )}

      {error && !loading && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && report && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard
              label="Total penjualan"
              value={formatIdr(report.summary.totalRevenue)}
              accent
            />
            <SummaryCard label="Transaksi" value={String(report.summary.orderCount)} />
            <SummaryCard label="Kasir" value={String(report.summary.posOrders)} />
            <SummaryCard label="Antar" value={String(report.summary.deliveryOrders)} />
          </div>

          <div className="print:hidden">
            <SalesReportDocument data={report} variant="screen" />
          </div>
        </>
      )}

      {/* Dokumen khusus cetak A4 — terpisah dari struk thermal */}
      {report && (
        <div className="sales-report-print-host pointer-events-none fixed left-0 top-0 -z-10 opacity-0 print:pointer-events-auto print:static print:z-auto print:opacity-100">
          <SalesReportDocument data={report} variant="print" />
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-card p-4",
        accent && "border-orange-500/30"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold", accent ? "text-orange-300" : "text-white")}>
        {value}
      </p>
    </div>
  );
}
