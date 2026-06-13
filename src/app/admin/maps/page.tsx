import { Suspense } from "react";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { DriverLiveMap } from "@/components/admin/DriverLiveMap";
import {
  fetchCityOptions,
  fetchLiveDriverPins,
  fetchProvinceOptions,
} from "@/lib/admin/live-drivers";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClusterForServiceCity } from "@/lib/operational-cluster";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ provinceId?: string; cityId?: string }>;

/** URL: /admin/maps — peta cluster operasional + realtime driver GPS */
export default async function AdminLiveMapsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await verifyAdminSession();
  const params = await searchParams;

  const provinceId =
    session.adminRole === "SUPER_ADMIN" && params.provinceId
      ? Number(params.provinceId)
      : session.provinceId;

  const cityId =
    session.adminRole === "CITY_ADMIN"
      ? session.cityId
      : params.cityId
        ? Number(params.cityId)
        : null;

  let clusterId: string | null = null;
  let clusterName: string | null = null;

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    const admin = createAdminClient();
    const { data: sc } = await admin
      .from("service_cities")
      .select("id, operational_cluster_id, operational_clusters(name)")
      .eq("city_id", session.cityId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    clusterId =
      (sc?.operational_cluster_id as string | null) ??
      (sc?.id ? await resolveClusterForServiceCity(admin, sc.id as string) : null);

    const clusterJoin = sc?.operational_clusters as
      | { name: string }
      | { name: string }[]
      | null
      | undefined;
    clusterName = Array.isArray(clusterJoin)
      ? clusterJoin[0]?.name ?? null
      : clusterJoin?.name ?? null;
  }

  const [drivers, provinces, cities] = await Promise.all([
    fetchLiveDriverPins(session, {
      provinceId: session.adminRole === "SUPER_ADMIN" ? provinceId : session.provinceId,
      cityId,
      clusterMode: true,
    }),
    fetchProvinceOptions(session),
    fetchCityOptions(
      session,
      session.adminRole === "SUPER_ADMIN" ? provinceId : session.provinceId
    ),
  ]);

  const displayClusterName =
    clusterName ?? drivers.find((d) => d.clusterName)?.clusterName ?? null;

  return (
    <main className="p-6 text-slate-800">
      <h1 className="text-2xl font-bold text-slate-900">Peta Live Driver — Cluster Operasional</h1>
      <p className="mt-1 text-sm text-slate-600">
        Driver NGOJEK/NGOMOBIL bebas bergerak lintas kota dalam cluster yang sama
        (mis. Jabodetabek). City Admin tetap mengelola laporan berdasarkan kota
        pendaftaran.
      </p>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat peta...</p>}>
          <DriverLiveMap
            adminRole={session.adminRole}
            initialDrivers={drivers}
            provinces={provinces}
            cities={cities}
            lockedCityName={session.cityName}
            clusterId={clusterId}
            clusterName={displayClusterName}
          />
        </Suspense>
      </div>
    </main>
  );
}
