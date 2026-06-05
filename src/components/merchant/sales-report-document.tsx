"use client";

import { formatIdr } from "@/lib/utils";
import {
  channelReportLabel,
  type SalesReportData,
} from "@/lib/sales-report";

type Props = {
  data: SalesReportData;
  /** Untuk preview di layar (gelap) vs dokumen cetak (putih) */
  variant?: "screen" | "print";
};

export function SalesReportDocument({ data, variant = "screen" }: Props) {
  const isPrintDoc = variant === "print";
  const rootId = isPrintDoc ? "sales-report-print" : undefined;

  return (
    <div
      id={rootId}
      className={
        isPrintDoc
          ? "sales-report-paper mx-auto bg-white p-8 font-sans text-black"
          : "rounded-2xl border border-white/10 bg-white p-6 text-black shadow-lg"
      }
    >
      <header className="border-b border-black/20 pb-4">
        <p className="text-xs uppercase tracking-wider text-gray-600">WIRA Kuliner</p>
        <h1 className="text-xl font-bold">Laporan Penjualan</h1>
        <p className="mt-1 text-lg font-semibold">{data.merchantName}</p>
        <p className="mt-2 text-sm text-gray-700">
          Periode: <strong>{data.periodLabel}</strong> ({data.rangeLabel})
        </p>
        <p className="text-xs text-gray-500">
          Dicetak:{" "}
          {new Date(data.generatedAt).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Total penjualan" value={formatIdr(data.summary.totalRevenue)} highlight />
        <StatBox label="Jumlah transaksi" value={String(data.summary.orderCount)} />
        <StatBox label="Produk" value={formatIdr(data.summary.productRevenue)} />
        <StatBox label="Ongkir" value={formatIdr(data.summary.deliveryRevenue)} />
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <StatBox label="Kasir" value={String(data.summary.posOrders)} small />
        <StatBox label="Di tempat" value={String(data.summary.dineInOrders)} small />
        <StatBox label="Antar" value={String(data.summary.deliveryOrders)} small />
      </section>

      {data.topProducts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Menu terlaris</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/20 text-left text-xs text-gray-600">
                <th className="py-1">Produk</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Omzet</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((p) => (
                <tr key={p.name} className="border-b border-black/10">
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5 text-right">{p.quantity}</td>
                  <td className="py-1.5 text-right">{formatIdr(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Rincian transaksi</h2>
        {data.orders.length === 0 ? (
          <p className="text-sm text-gray-600">Tidak ada penjualan pada periode ini.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/20 text-left text-gray-600">
                <th className="py-1">Waktu</th>
                <th className="py-1">ID</th>
                <th className="py-1">Saluran</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id} className="border-b border-black/10">
                  <td className="py-1 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-1 font-mono">{o.id.slice(0, 8)}</td>
                  <td className="py-1">{channelReportLabel(o.channel)}</td>
                  <td className="py-1 text-right font-medium">{formatIdr(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-8 border-t border-black/20 pt-3 text-center text-xs text-gray-500">
        Laporan ini untuk arsip merchant — bukan struk thermal pelanggan.
      </footer>
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-black/10 p-2 ${highlight ? "bg-orange-50" : "bg-gray-50"} ${small ? "" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-wide text-gray-600">{label}</p>
      <p className={`font-bold ${small ? "text-sm" : "text-base"}`}>{value}</p>
    </div>
  );
}
