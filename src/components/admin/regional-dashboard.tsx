import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import { regionalDashboardTitle } from "@/app/utils/adminAuth";
import type { DashboardStats } from "@/lib/admin/dashboard-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIdr } from "@/lib/utils";
import {
  Building2,
  MapPin,
  Package,
  Store,
  Truck,
  TrendingUp,
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
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** UI dashboard dinamis per tier — Super / Province / City Admin. */
export function RegionalDashboard({
  session,
  stats,
}: {
  session: RegionalAdminSession;
  stats: DashboardStats;
}) {
  const tier = session.adminRole;

  return (
    <main className="p-6">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {stats.scopeLabel}
        </p>
        <h1 className="text-2xl font-bold">{regionalDashboardTitle(session)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tier === "SUPER_ADMIN" &&
            "Ringkasan operasional seluruh wilayah WIRA Kuliner & Ride."}
          {tier === "PROVINCE_ADMIN" &&
            "Agregat provinsi — merchant, driver, dan GMV di bawah wilayah Anda."}
          {tier === "CITY_ADMIN" &&
            "Performa harian kota — fokus order aktif dan penyelesaian hari ini."}
        </p>
      </div>

      {tier === "SUPER_ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Provinsi Aktif"
            value={stats.provincesActive}
            icon={MapPin}
            hint="Wilayah terdaftar di sistem"
          />
          <StatCard
            title="Merchant Aktif"
            value={stats.merchants}
            icon={Store}
            hint="Seluruh Indonesia"
          />
          <StatCard
            title="Driver Terdaftar"
            value={stats.drivers}
            icon={Truck}
            hint="Motor, mobil, kargo"
          />
          <StatCard
            title="GMV Nasional"
            value={formatIdr(stats.gmvTotal)}
            icon={TrendingUp}
            hint="Order delivered (kumulatif)"
          />
        </div>
      )}

      {tier === "PROVINCE_ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Kota di Provinsi"
            value={stats.citiesInProvince}
            icon={Building2}
          />
          <StatCard
            title="Merchant Aktif"
            value={stats.merchants}
            icon={Store}
          />
          <StatCard
            title="Driver"
            value={stats.drivers}
            icon={Truck}
          />
          <StatCard
            title="GMV Provinsi"
            value={formatIdr(stats.gmvTotal)}
            icon={TrendingUp}
            hint="Kumulatif order selesai"
          />
        </div>
      )}

      {tier === "CITY_ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Order Hari Ini"
            value={stats.ordersToday}
            icon={Package}
            hint="Dibuat sejak 00:00"
          />
          <StatCard
            title="Selesai Hari Ini"
            value={stats.completedToday}
            icon={TrendingUp}
          />
          <StatCard
            title="Sedang Berjalan"
            value={stats.ordersActive}
            icon={Truck}
            hint="Paid → on the way"
          />
          <StatCard
            title="GMV Hari Ini"
            value={formatIdr(stats.gmvToday)}
            icon={Store}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tier !== "CITY_ADMIN" && (
          <StatCard
            title="Order Hari Ini"
            value={stats.ordersToday}
            icon={Package}
            hint="Semua channel"
          />
        )}
        {tier !== "CITY_ADMIN" && (
          <StatCard
            title="GMV Hari Ini"
            value={formatIdr(stats.gmvToday)}
            icon={TrendingUp}
          />
        )}
        <StatCard
          title="Order Aktif"
          value={stats.ordersActive}
          icon={Truck}
          hint="Belum delivered / cancelled"
        />
      </div>
    </main>
  );
}
