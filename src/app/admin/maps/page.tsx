import { Suspense } from "react";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { AdminLiveMap } from "@/components/admin/admin-live-map";
import {
  fetchCityOptions,
  fetchLiveDriverPins,
  fetchProvinceOptions,
} from "@/lib/admin/live-drivers";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ provinceId?: string; cityId?: string }>;

/** URL: /admin/maps */
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

  const [drivers, provinces, cities] = await Promise.all([
    fetchLiveDriverPins(session, {
      provinceId: session.adminRole === "SUPER_ADMIN" ? provinceId : session.provinceId,
      cityId,
    }),
    fetchProvinceOptions(session),
    fetchCityOptions(
      session,
      session.adminRole === "SUPER_ADMIN" ? provinceId : session.provinceId
    ),
  ]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Peta Live & Lokasi Driver</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pelacakan real-time posisi driver sesuai lingkup wilayah admin Anda.
      </p>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat peta...</p>}>
          <AdminLiveMap
            adminRole={session.adminRole}
            drivers={drivers}
            provinces={provinces}
            cities={cities}
            lockedCityName={session.cityName}
          />
        </Suspense>
      </div>
    </main>
  );
}
