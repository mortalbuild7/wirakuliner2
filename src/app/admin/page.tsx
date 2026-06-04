"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";

const RevenueChart = dynamic(
  () => import("@/components/admin/revenue-chart").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Memuat grafik...</p> }
);

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState({ merchants: 0, orders: 0, gmv: 0 });
  const [chart, setChart] = useState<{ name: string; revenue: number }[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase.from("merchants").select("id", { count: "exact" }).then(({ count }) =>
      setStats((s) => ({ ...s, merchants: count ?? 0 }))
    );
    supabase
      .from("orders")
      .select("merchant_id, total_product_amount, delivery_fee, merchants(name)")
      .eq("order_status", "delivered")
      .then(({ data }) => {
        const gmv =
          data?.reduce(
            (a, o) => a + Number(o.total_product_amount) + Number(o.delivery_fee),
            0
          ) ?? 0;
        setStats((s) => ({ ...s, orders: data?.length ?? 0, gmv }));
        const byMerchant: Record<string, number> = {};
        data?.forEach((o) => {
          const n = merchantNameFromJoin(
            o.merchants as { name: string } | { name: string }[] | null
          );
          byMerchant[n] =
            (byMerchant[n] ?? 0) +
            Number(o.total_product_amount) +
            Number(o.delivery_fee);
        });
        setChart(Object.entries(byMerchant).map(([name, revenue]) => ({ name, revenue })));
      });
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Financial Analytics</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Merchant Aktif</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.merchants}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Order Selesai</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{stats.orders}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">GMV Platform</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{formatIdr(stats.gmv)}</CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Revenue per Merchant</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <RevenueChart data={chart} />
        </CardContent>
      </Card>
    </main>
  );
}
