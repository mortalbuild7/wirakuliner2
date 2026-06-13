"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminTier } from "@/app/utils/adminAuth";
import type {
  CityOption,
  LiveDriverPin,
  ProvinceOption,
} from "@/lib/admin/live-drivers";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useSubscribeAdminDriverGps } from "@/hooks/use-subscribe-driver-gps";
import { Loader2, MapPin, Radio } from "lucide-react";

const LiveMapInner = dynamic(
  () =>
    import("@/components/admin/admin-live-map-inner").then(
      (m) => m.AdminLiveMapInner
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-2xl bg-slate-950 text-sm text-slate-400">
        Memuat peta driver...
      </div>
    ),
  }
);

function pinFromRow(row: Record<string, unknown>): LiveDriverPin | null {
  const lat = row.current_lat;
  const lng = row.current_lng;
  if (lat == null || lng == null) return null;

  const clusterJoin = row.operational_clusters as
    | { name: string }
    | { name: string }[]
    | null;
  const clusterName = Array.isArray(clusterJoin)
    ? clusterJoin[0]?.name
    : clusterJoin?.name;

  return {
    id: String(row.id),
    name: String(row.name ?? "Driver"),
    status: String(row.status ?? "offline"),
    lat: Number(lat),
    lng: Number(lng),
    vehiclePlate: (row.vehicle_plate as string | null) ?? null,
    serviceCategory: (row.service_category as string | null) ?? null,
    cityId: (row.city_id as number | null) ?? null,
    provinceId: (row.province_id as number | null) ?? null,
    operationalClusterId: (row.operational_cluster_id as string | null) ?? null,
    registrationServiceCityId:
      (row.registration_service_city_id as string | null) ?? null,
    clusterName: clusterName ?? null,
  };
}

/**
 * Peta pemantauan driver realtime — cluster operasional fluid (Jabodetabek).
 * City Admin melihat seluruh driver dalam cluster, bukan hanya kota pendaftaran.
 */
export function DriverLiveMap({
  adminRole,
  initialDrivers,
  provinces,
  cities,
  lockedCityName,
  clusterId,
  clusterName,
}: {
  adminRole: AdminTier;
  initialDrivers: LiveDriverPin[];
  provinces: ProvinceOption[];
  cities: CityOption[];
  lockedCityName?: string | null;
  clusterId?: string | null;
  clusterName?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const provinceId = searchParams.get("provinceId") ?? "";
  const cityId = searchParams.get("cityId") ?? "";

  const [drivers, setDrivers] = useState<LiveDriverPin[]>(initialDrivers);
  const [live, setLive] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(() => new Date());

  const idleCount = useMemo(
    () => drivers.filter((d) => d.status === "idle").length,
    [drivers]
  );

  const refreshPins = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("drivers")
      .select(
        "id, name, status, current_lat, current_lng, vehicle_plate, service_category, city_id, province_id, operational_cluster_id, registration_service_city_id, operational_clusters(name)"
      )
      .not("current_lat", "is", null)
      .not("current_lng", "is", null)
      .neq("status", "offline");

    if (clusterId) {
      query = query.eq("operational_cluster_id", clusterId);
    } else if (adminRole === "PROVINCE_ADMIN" && provinceId) {
      query = query.eq("province_id", Number(provinceId));
      if (cityId) query = query.eq("city_id", Number(cityId));
    } else if (adminRole === "SUPER_ADMIN") {
      if (provinceId) query = query.eq("province_id", Number(provinceId));
      if (cityId) query = query.eq("city_id", Number(cityId));
    }

    const { data } = await query.limit(500);
    const pins = (data ?? [])
      .map((row) => pinFromRow(row as Record<string, unknown>))
      .filter((p): p is LiveDriverPin => p != null);
    setDrivers(pins);
    setLastSync(new Date());
  }, [adminRole, clusterId, provinceId, cityId]);

  const onBroadcastPosition = useCallback(
    (driverId: string, lat: number, lng: number, status?: string) => {
      setDrivers((prev) => {
        const idx = prev.findIndex((d) => d.id === driverId);
        if (status === "offline") {
          return prev.filter((d) => d.id !== driverId);
        }
        if (idx < 0) return prev;
        const pin = prev[idx];
        if (clusterId && pin.operationalClusterId !== clusterId) return prev;
        const next = [...prev];
        next[idx] = {
          ...pin,
          lat,
          lng,
          status: status ?? pin.status,
        };
        return next;
      });
      setLastSync(new Date());
    },
    [clusterId]
  );

  useSubscribeAdminDriverGps(live, onBroadcastPosition);

  useEffect(() => {
    setDrivers(initialDrivers);
  }, [initialDrivers]);

  useEffect(() => {
    if (!live) return;

    const supabase = createClient();
    const channel = supabase
      .channel("driver-live-map")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers" },
        (payload) => {
          const pin = pinFromRow(payload.new as Record<string, unknown>);
          if (!pin) return;
          if (clusterId && pin.operationalClusterId !== clusterId) return;

          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === pin.id);
            if (pin.status === "offline") {
              return prev.filter((d) => d.id !== pin.id);
            }
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...pin };
              return next;
            }
            return [...prev, pin];
          });
          setLastSync(new Date());
        }
      )
      .subscribe();

    const poll = setInterval(() => {
      void refreshPins();
    }, 60_000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [live, clusterId, refreshPins]);

  function updateFilter(key: "provinceId" | "cityId", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "provinceId") params.delete("cityId");
    router.push(`/admin/maps?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {adminRole === "SUPER_ADMIN" && (
          <div className="min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Provinsi</Label>
            <select
              className="mt-1 w-full rounded-2xl border bg-background px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-2xl border bg-background px-3 py-2 text-sm"
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
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">
            Pendaftaran: <strong>{lockedCityName}</strong>
            {clusterName && (
              <span className="ml-2 text-muted-foreground">
                · Cluster: <strong>{clusterName}</strong>
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
        >
          {live ? (
            <Radio className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Loader2 className="h-3.5 w-3.5" />
          )}
          {live ? "Realtime aktif" : "Realtime mati"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        <span>
          {drivers.length} driver GPS aktif · {idleCount} siap narik (idle)
        </span>
        <span>· Sync {lastSync.toLocaleTimeString("id-ID")}</span>
        {clusterName && <span>· Cluster {clusterName}</span>}
      </div>

      <LiveMapInner drivers={drivers} />
    </div>
  );
}
