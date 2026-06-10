import type { RegionalAdminSession } from "@/app/utils/adminAuth";
import { createClient } from "@/lib/supabase/server";

export type CityGmvRow = {
  cityId: number;
  cityName: string;
  revenue: number;
  orders: number;
};

export type DashboardStats = {
  scopeLabel: string;
  merchants: number;
  drivers: number;
  driversOnline: number;
  ordersToday: number;
  ordersActive: number;
  gmvToday: number;
  gmvTotal: number;
  completedToday: number;
  citiesInProvince: number;
  provincesActive: number;
  /** CITY_ADMIN — antrean verifikasi berkas (driver tanpa foto/plat) */
  pendingDriverVerification: number;
  /** PROVINCE_ADMIN — performa per kota */
  cityGmvBreakdown: CityGmvRow[];
};

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function applyMerchantScope<T extends { eq: (col: string, val: number) => T }>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return query.eq("province_id", session.provinceId);
  }
  return query;
}

function applyDriverScope<T extends { eq: (col: string, val: number) => T }>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return query.eq("province_id", session.provinceId);
  }
  return query;
}

function applyOrderScope<T extends { eq: (col: string, val: number) => T }>(
  query: T,
  session: RegionalAdminSession
): T {
  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    return query.eq("city_id", session.cityId);
  }
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    return query.eq("province_id", session.provinceId);
  }
  return query;
}

/** Statistik dashboard — di-scope RLS + filter server sesuai tier admin. */
export async function fetchDashboardStats(
  session: RegionalAdminSession
): Promise<DashboardStats> {
  const supabase = await createClient();
  const todayStart = todayStartIso();

  let scopeLabel = "Nasional";
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceName) {
    scopeLabel = `Provinsi ${session.provinceName}`;
  } else if (session.adminRole === "CITY_ADMIN" && session.cityName) {
    scopeLabel = `Kota ${session.cityName}`;
  }

  let merchantQuery = supabase
    .from("merchants")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  merchantQuery = applyMerchantScope(merchantQuery, session);
  const { count: merchants } = await merchantQuery;

  let driverQuery = supabase
    .from("drivers")
    .select("id", { count: "exact", head: true });
  driverQuery = applyDriverScope(driverQuery, session);
  const { count: drivers } = await driverQuery;

  let driversOnlineQuery = supabase
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .neq("status", "offline");
  driversOnlineQuery = applyDriverScope(driversOnlineQuery, session);
  const { count: driversOnline } = await driversOnlineQuery;

  let pendingVerifyQuery = supabase
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .or("photo_url.is.null,vehicle_plate.is.null");
  pendingVerifyQuery = applyDriverScope(pendingVerifyQuery, session);
  const { count: pendingDriverVerification } = await pendingVerifyQuery;

  let ordersTodayQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart);
  ordersTodayQuery = applyOrderScope(ordersTodayQuery, session);
  const { count: ordersToday } = await ordersTodayQuery;

  let ordersActiveQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);
  ordersActiveQuery = applyOrderScope(ordersActiveQuery, session);
  const { count: ordersActive } = await ordersActiveQuery;

  let completedTodayQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("order_status", "delivered")
    .gte("updated_at", todayStart);
  completedTodayQuery = applyOrderScope(completedTodayQuery, session);
  const { count: completedToday } = await completedTodayQuery;

  let gmvTodayQuery = supabase
    .from("orders")
    .select("total_product_amount, delivery_fee")
    .eq("order_status", "delivered")
    .gte("updated_at", todayStart);
  gmvTodayQuery = applyOrderScope(gmvTodayQuery, session);
  const { data: gmvTodayRows } = await gmvTodayQuery;

  let gmvTotalQuery = supabase
    .from("orders")
    .select("total_product_amount, delivery_fee")
    .eq("order_status", "delivered");
  gmvTotalQuery = applyOrderScope(gmvTotalQuery, session);
  const { data: gmvTotalRows } = await gmvTotalQuery;

  const sumGmv = (rows: { total_product_amount: number; delivery_fee: number }[] | null) =>
    (rows ?? []).reduce(
      (acc, o) => acc + Number(o.total_product_amount) + Number(o.delivery_fee),
      0
    );

  let citiesInProvince = 0;
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    const { count } = await supabase
      .from("cities")
      .select("id", { count: "exact", head: true })
      .eq("province_id", session.provinceId);
    citiesInProvince = count ?? 0;
  }

  let provincesActive = 0;
  if (session.adminRole === "SUPER_ADMIN") {
    const { count } = await supabase
      .from("provinces")
      .select("id", { count: "exact", head: true });
    provincesActive = count ?? 0;
  }

  let cityGmvBreakdown: CityGmvRow[] = [];
  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    const { data: cityOrders } = await supabase
      .from("orders")
      .select("city_id, total_product_amount, delivery_fee, cities(name)")
      .eq("order_status", "delivered")
      .eq("province_id", session.provinceId)
      .not("city_id", "is", null);

    const byCity = new Map<number, { name: string; revenue: number; orders: number }>();
    for (const row of cityOrders ?? []) {
      const cid = row.city_id as number;
      const cityJoin = row.cities as { name: string } | { name: string }[] | null;
      const cname = Array.isArray(cityJoin) ? cityJoin[0]?.name : cityJoin?.name;
      const prev = byCity.get(cid) ?? { name: cname ?? `Kota ${cid}`, revenue: 0, orders: 0 };
      prev.revenue += Number(row.total_product_amount) + Number(row.delivery_fee);
      prev.orders += 1;
      byCity.set(cid, prev);
    }
    cityGmvBreakdown = [...byCity.entries()]
      .map(([cityId, v]) => ({
        cityId,
        cityName: v.name,
        revenue: v.revenue,
        orders: v.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  return {
    scopeLabel,
    merchants: merchants ?? 0,
    drivers: drivers ?? 0,
    driversOnline: driversOnline ?? 0,
    ordersToday: ordersToday ?? 0,
    ordersActive: ordersActive ?? 0,
    completedToday: completedToday ?? 0,
    gmvToday: sumGmv(gmvTodayRows),
    gmvTotal: sumGmv(gmvTotalRows),
    citiesInProvince,
    provincesActive,
    pendingDriverVerification: pendingDriverVerification ?? 0,
    cityGmvBreakdown,
  };
}
