import rawRegions from "@/data/indonesia-regions.json";
import { getIndonesiaProvinceById } from "@/app/utils/indonesiaProvinces";
import {
  formatWilayahCityName,
  normalizeCityNameForDedup,
} from "@/lib/wilayah-city-format";

export type ProvinceRegionData = {
  provinceId: number;
  provinceName: string;
  cities: readonly string[];
};

type RawRegionEntry = {
  provinceId: number;
  provinceName: string;
  cities: string[];
};

function buildRegionsMap(): Record<number, ProvinceRegionData> {
  const out: Record<number, ProvinceRegionData> = {};

  for (const [key, entry] of Object.entries(
    rawRegions as Record<string, RawRegionEntry>
  )) {
    const provinceId = Number(key);
    const seen = new Set<string>();
    const cities: string[] = [];

    for (const raw of entry.cities) {
      const formatted = formatWilayahCityName(raw);
      if (!formatted || formatted.length < 2) continue;
      const dedupKey = normalizeCityNameForDedup(formatted);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      cities.push(formatted);
    }

    cities.sort((a, b) => a.localeCompare(b, "id"));

    out[provinceId] = {
      provinceId,
      provinceName:
        getIndonesiaProvinceById(provinceId)?.name ?? entry.provinceName,
      cities,
    };
  }

  return out;
}

const REGIONS_BY_PROVINCE_ID = buildRegionsMap();

/** Daftar kota/kabupaten resmi + operasional untuk satu provinsi (ID 1–38). */
export function getCitiesByProvinceId(provinceId: number): readonly string[] {
  return REGIONS_BY_PROVINCE_ID[provinceId]?.cities ?? [];
}

/** Metadata provinsi dari master lokal. */
export function getProvinceRegionData(
  provinceId: number
): ProvinceRegionData | undefined {
  return REGIONS_BY_PROVINCE_ID[provinceId];
}

/** Apakah nama kota valid dan termasuk provinsi terpilih. */
export function isCityInProvince(
  provinceId: number,
  cityName: string
): boolean {
  return findCityInProvince(provinceId, cityName) != null;
}

/** Kembalikan label kota resmi (format seragam) jika cocok dengan provinsi. */
export function findCityInProvince(
  provinceId: number,
  cityName: string
): string | undefined {
  const key = normalizeCityNameForDedup(cityName);
  if (!key) return undefined;
  return getCitiesByProvinceId(provinceId).find(
    (c) => normalizeCityNameForDedup(c) === key
  );
}

/** Filter kota untuk admin CITY_ADMIN — hanya kota yurisdiksi (nama fleksibel). */
export function filterCitiesForAdminScope(
  provinceId: number,
  lockedCityName: string | null | undefined
): readonly string[] {
  const all = getCitiesByProvinceId(provinceId);
  if (!lockedCityName?.trim()) return all;

  const lockKey = normalizeCityNameForDedup(lockedCityName);
  const matched = all.filter(
    (c) => normalizeCityNameForDedup(c) === lockKey
  );
  return matched.length > 0 ? matched : all;
}
