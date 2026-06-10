"use client";

import dynamic from "next/dynamic";
import type { CityGmvRow } from "@/lib/admin/dashboard-stats";

const RevenueChart = dynamic(
  () => import("@/components/admin/revenue-chart").then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Memuat grafik...</p>,
  }
);

export function ProvinceCityChart({ rows }: { rows: CityGmvRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Belum ada data GMV per kota.</p>;
  }

  return (
    <RevenueChart
      data={rows.map((c) => ({
        name: c.cityName,
        revenue: c.revenue,
      }))}
    />
  );
}
