"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminTier } from "@/app/utils/adminAuth";
import type {
  CityOption,
  LiveDriverPin,
  ProvinceOption,
} from "@/lib/admin/live-drivers";
import { Label } from "@/components/ui/label";

const LiveMapInner = dynamic(
  () => import("@/components/admin/admin-live-map-inner").then((m) => m.AdminLiveMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] items-center justify-center rounded-xl bg-stone-900 text-sm text-stone-400">
        Memuat peta...
      </div>
    ),
  }
);

export function AdminLiveMap({
  adminRole,
  drivers,
  provinces,
  cities,
  lockedCityName,
}: {
  adminRole: AdminTier;
  drivers: LiveDriverPin[];
  provinces: ProvinceOption[];
  cities: CityOption[];
  lockedCityName?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const provinceId = searchParams.get("provinceId") ?? "";
  const cityId = searchParams.get("cityId") ?? "";

  function updateFilter(key: "provinceId" | "cityId", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "provinceId") params.delete("cityId");
    router.push(`/admin/dashboard/maps?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {adminRole === "SUPER_ADMIN" && (
          <div className="min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Provinsi</Label>
            <select
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={provinceId}
              onChange={(e) => updateFilter("provinceId", e.target.value)}
            >
              <option value="">Semua provinsi</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {(adminRole === "SUPER_ADMIN" || adminRole === "PROVINCE_ADMIN") && (
          <div className="min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Kota</Label>
            <select
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={cityId}
              onChange={(e) => updateFilter("cityId", e.target.value)}
              disabled={adminRole === "SUPER_ADMIN" && !provinceId}
            >
              <option value="">Semua kota</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {adminRole === "CITY_ADMIN" && lockedCityName && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
            Wilayah terkunci: <strong>{lockedCityName}</strong>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {drivers.length} driver online dengan GPS aktif
        {drivers.filter((d) => d.status === "idle").length > 0 &&
          ` · ${drivers.filter((d) => d.status === "idle").length} idle`}
      </p>

      <LiveMapInner drivers={drivers} />
    </div>
  );
}
