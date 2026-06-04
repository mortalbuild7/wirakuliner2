"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

const COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa"];

export default function PublicReportPage() {
  const [stats, setStats] = useState({
    active_merchants: 0,
    completed_orders: 0,
    total_gmv: 0,
  });
  const [breakdown, setBreakdown] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("platform_stats_public").select("*").single().then(({ data }) => {
      if (data) {
        setStats({
          active_merchants: data.active_merchants ?? 0,
          completed_orders: data.completed_orders ?? 0,
          total_gmv: Number(data.total_gmv ?? 0),
        });
      }
    });
    supabase
      .from("orders")
      .select("total_product_amount, delivery_fee, merchants(name)")
      .eq("order_status", "delivered")
      .then(({ data }) => {
        const map: Record<string, number> = {};
        data?.forEach((o) => {
          const n = merchantNameFromJoin(
            o.merchants as { name: string } | { name: string }[] | null,
            "Lainnya"
          );
          map[n] =
            (map[n] ?? 0) +
            Number(o.total_product_amount) +
            Number(o.delivery_fee);
        });
        setBreakdown(
          Object.entries(map).map(([name, value]) => ({ name, value }))
        );
      });
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-wira-orange">WIRA Kuliner</h1>
        <p className="mt-2 text-muted-foreground">Laporan Transparansi Publik</p>
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Merchant Aktif</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.active_merchants}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pesanan Selesai</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.completed_orders}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total GMV</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatIdr(stats.total_gmv)}</CardContent>
        </Card>
      </div>
      {breakdown.length > 0 && (
        <Card className="mx-auto mt-8 max-w-md">
          <CardHeader>
            <CardTitle>Distribusi per Merchant</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatIdr(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
