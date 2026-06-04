"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AdminReportsPage() {
  const [rows, setRows] = useState<
    { merchant: string; orders: number; revenue: number }[]
  >([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("orders")
      .select("merchant_id, total_product_amount, delivery_fee, merchants(name)")
      .eq("order_status", "delivered")
      .then(({ data }) => {
        const map: Record<string, { merchant: string; orders: number; revenue: number }> = {};
        data?.forEach((o) => {
          const mid = o.merchant_id;
          const name = merchantNameFromJoin(
            o.merchants as { name: string } | { name: string }[] | null,
            mid
          );
          if (!map[mid]) map[mid] = { merchant: name, orders: 0, revenue: 0 };
          map[mid].orders += 1;
          map[mid].revenue +=
            Number(o.total_product_amount) + Number(o.delivery_fee);
        });
        setRows(Object.values(map));
      });
  }, []);

  return (
    <main className="p-6 print:p-0" id="financial-report">
      <div className="flex justify-between print:hidden">
        <h1 className="text-2xl font-bold">Laporan Keuangan</h1>
        <Button onClick={() => window.print()}>Cetak / PDF</Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground print:text-black">
        WIRA Kuliner — Financial Statement
      </p>
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
        </tbody>
      </table>
    </main>
  );
}
