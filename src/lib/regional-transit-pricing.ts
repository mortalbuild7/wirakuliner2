/**
 * Tarif regional multi-service — harga transit dihitung server-side dari DB.
 * Anti-Parameter Tampering: client tidak boleh mengirim delivery_fee final.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceType } from "@/lib/service-types";

export type RegionalTariffRow = {
  id: string;
  province_id: number;
  city_id: number | null;
  service_type: ServiceType;
  base_fare: number;
  price_per_km: number;
};

/**
 * Ambil tarif sah: prioritas kota spesifik → fallback provinsi (city_id NULL).
 */
export async function fetchRegionalTransitTariff(
  admin: SupabaseClient,
  provinceId: number,
  cityId: number | null,
  serviceType: ServiceType
): Promise<RegionalTariffRow | null> {
  if (cityId != null) {
    const { data: cityTariff } = await admin
      .from("regional_tariffs")
      .select("id, province_id, city_id, service_type, base_fare, price_per_km")
      .eq("province_id", provinceId)
      .eq("city_id", cityId)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (cityTariff) {
      return cityTariff as RegionalTariffRow;
    }
  }

  const { data: provincial } = await admin
    .from("regional_tariffs")
    .select("id, province_id, city_id, service_type, base_fare, price_per_km")
    .eq("province_id", provinceId)
    .is("city_id", null)
    .eq("service_type", serviceType)
    .maybeSingle();

  return (provincial as RegionalTariffRow | null) ?? null;
}

/** Resolve province_id & city_id dari service_cities (UUID) untuk lookup tarif. */
export async function resolveRegionalIdsFromServiceCity(
  admin: SupabaseClient,
  serviceCityId: string | null
): Promise<{ provinceId: number | null; cityId: number | null }> {
  if (!serviceCityId) return { provinceId: null, cityId: null };

  const { data } = await admin
    .from("service_cities")
    .select("province_id, city_id")
    .eq("id", serviceCityId)
    .maybeSingle();

  return {
    provinceId: data?.province_id ?? null,
    cityId: data?.city_id ?? null,
  };
}

/**
 * Kalkulasi ongkir transit: base_fare + (price_per_km × jarak km).
 * Fallback ke tarif hardcoded jika wilayah belum dikonfigurasi admin.
 */
export function computeTransitFareFromTariff(
  tariff: RegionalTariffRow | null,
  distanceKm: number,
  fallbackBase = 10_000,
  fallbackPerKm = 2_000
): number {
  const km = Math.max(0, distanceKm);
  const base = tariff ? Number(tariff.base_fare) : fallbackBase;
  const perKm = tariff ? Number(tariff.price_per_km) : fallbackPerKm;
  return Math.round(base + perKm * km);
}
