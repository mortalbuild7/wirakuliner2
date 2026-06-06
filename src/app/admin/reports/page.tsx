"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

const CONFIRM_PHRASE = "RESET LAPORAN";

export default function AdminReportsPage() {
  const [rows, setRows] = useState<
    { merchant: string; orders: number; revenue: number }[]
  >([]);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .select("merchant_id, total_product_amount, delivery_fee, merchants(name)")
      .eq("order_status", "delivered");

    const map: Record<string, { merchant: string; orders: number; revenue: number }> = {};
    data?.forEach((o) => {
      const mid = o.merchant_id;
      const name = merchantNameFromJoin(
        o.merchants as { name: string } | { name: string }[] | null,
        mid
      );
      if (!map[mid]) map[mid] = { merchant: name, orders: 0, revenue: 0 };
      map[mid].orders += 1;
      map[mid].revenue += Number(o.total_product_amount) + Number(o.delivery_fee);
    });
    setRows(Object.values(map));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resetReports() {
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      setError(`Ketik "${CONFIRM_PHRASE}" untuk konfirmasi`);
      return;
    }
    if (
      !confirm(
        "Hapus SEMUA data pesanan? Laporan keuangan akan kosong. Tindakan tidak bisa dibatalkan."
      )
    ) {
      return;
    }

    setResetting(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/reports/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ confirm: confirmText.trim() }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    setResetting(false);

    if (!res.ok) {
      setError(body.error ?? "Gagal reset laporan");
      return;
    }

    setSuccess(body.message ?? "Laporan berhasil direset");
    setConfirmText("");
    load();
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

  return (
    <main className="p-6 print:p-0" id="financial-report">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Laporan Keuangan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            WIRA Kuliner — Financial Statement
          </p>
        </div>
        <Button onClick={() => window.print()}>Cetak / PDF</Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4 max-w-xl print:hidden">
          {error}
        </Alert>
      )}
      {success && (
        <Alert className="mt-4 max-w-xl border-emerald-500/40 bg-emerald-500/10 text-emerald-900 print:hidden">
          {success}
        </Alert>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Merchant</th>
            <th className="py-2 text-right">Orders</th>
            <th className="py-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.merchant} className="border-b">
              <td className="py-2">{r.merchant}</td>
              <td className="py-2 text-right">{r.orders}</td>
              <td className="py-2 text-right">{formatIdr(r.revenue)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-muted-foreground">
                Belum ada pesanan selesai
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{totalOrders}</td>
              <td className="py-2 text-right">{formatIdr(totalRevenue)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <section className="mt-10 max-w-xl rounded-xl border border-red-200 bg-red-50/50 p-5 print:hidden">
        <h2 className="text-lg font-semibold text-red-800">Reset Laporan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Menghapus semua data pesanan (termasuk item & negosiasi). Gunakan hanya untuk audit
          ulang atau pengujian. Merchant, driver, dan customer tidak terhapus.
        </p>
        <div className="mt-4">
          <Label htmlFor="reset-confirm">
            Ketik <strong>{CONFIRM_PHRASE}</strong> untuk konfirmasi
          </Label>
          <Input
            id="reset-confirm"
            className="mt-1"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
          />
        </div>
        <Button
          className="mt-4"
          variant="destructive"
          disabled={resetting || confirmText.trim() !== CONFIRM_PHRASE}
          onClick={resetReports}
        >
          {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Reset semua laporan
        </Button>
      </section>
    </main>
  );
}
