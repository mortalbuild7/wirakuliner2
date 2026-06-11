import Link from "next/link";
import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import { regionalDashboardTitle } from "@/app/utils/adminAuth";
import type { DashboardStats } from "@/lib/admin/dashboard-stats";
import { MaskedRevenueWidget } from "@/components/admin/masked-revenue-widget";
import { ProvinceCityChart } from "@/components/admin/province-city-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";
import {
  FileCheck,
  MapPin,
  Package,
  SlidersHorizontal,
  Store,
  TrendingUp,
  Truck,
} from "lucide-react";

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: typeof Store;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Ringkasan performa dashboard — layout berbeda per tier jobdesk. */
export function RegionalDashboardSummary({
  session,
  stats,
}: {
  session: RegionalAdminSession;
  stats: DashboardStats;
}) {
  const tier = session.adminRole;

  return (
    <main className="p-6 text-slate-800">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          {stats.scopeLabel}
        </p>
        <h1 className="text-2xl font-bold text-slate-800">
          {regionalDashboardTitle(session)}
        </h1>
      </div>

      {tier === "SUPER_ADMIN" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Provinsi Aktif" value={stats.provincesActive} icon={MapPin} />
            <StatCard title="Merchant Aktif" value={stats.merchants} icon={Store} />
            <StatCard title="Driver Terdaftar" value={stats.drivers} icon={Truck} />
            <StatCard title="Driver Online" value={stats.driversOnline} icon={Truck} hint="Bukan offline" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <MaskedRevenueWidget
              label="Omset Kumulatif Nasional"
              amount={stats.gmvTotal}
              hint="Seluruh order delivered — data finansial sensitif"
            />
            <StatCard
              title="GMV Hari Ini"
              value={formatIdr(stats.gmvToday)}
              icon={TrendingUp}
            />
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/admin/maps">Buka Peta Live Driver</Link>
            </Button>
          </div>
        </>
      )}

      {tier === "PROVINCE_ADMIN" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Kota Operasional" value={stats.citiesInProvince} icon={MapPin} />
            <StatCard title="Merchant Aktif" value={stats.merchants} icon={Store} />
            <StatCard title="Driver" value={stats.drivers} icon={Truck} />
            <StatCard title="GMV Provinsi" value={formatIdr(stats.gmvTotal)} icon={TrendingUp} />
          </div>
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Performa Antar Kota</CardTitle>
              <Button asChild size="sm">
                <Link href="/admin/tariffs">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Kelola Tarif Regional
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="h-72">
              <ProvinceCityChart rows={stats.cityGmvBreakdown} />
            </CardContent>
          </Card>
        </>
      )}

      {tier === "CITY_ADMIN" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Driver Online Hari Ini"
              value={stats.driversOnline}
              icon={Truck}
              hint="Status idle / delivering"
            />
            <StatCard title="Merchant Aktif" value={stats.merchants} icon={Store} />
            <StatCard
              title="Antrean Verifikasi Berkas"
              value={stats.pendingDriverVerification}
              icon={FileCheck}
              hint="Driver tanpa foto / plat kendaraan"
            />
            <StatCard title="Order Hari Ini" value={stats.ordersToday} icon={Package} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard title="Selesai Hari Ini" value={stats.completedToday} icon={TrendingUp} />
            <StatCard title="Sedang Berjalan" value={stats.ordersActive} icon={Truck} />
            <StatCard title="GMV Hari Ini" value={formatIdr(stats.gmvToday)} icon={Store} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/drivers/verification">Proses Verifikasi Berkas</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/maps">Peta Live Kota</Link>
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
