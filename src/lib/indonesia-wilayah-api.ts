import "server-only";

const EMSIFA_BASE = "https://www.emsifa.com/api-wilayah-indonesia/api";

type EmsifaProvince = { id: string; name: string };
type EmsifaRegency = { id: string; name: string; province_id?: string };

let provincesCache: EmsifaProvince[] | null = null;
const regenciesCache = new Map<string, EmsifaRegency[]>();

function normalizeWilayahName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^dki\s+/, "dki ");
}

/** Muat daftar provinsi Kemendagri dari API EMSIFA (di-cache di memori proses). */
async function loadEmsifaProvinces(): Promise<EmsifaProvince[]> {
  if (provincesCache) return provincesCache;

  const res = await fetch(`${EMSIFA_BASE}/provinces.json`, {
    cache: "force-cache",
    next: { revalidate: 86_400 },
  });

  if (!res.ok) {
    throw new Error(`API wilayah provinsi gagal (${res.status})`);
  }

  const rows = (await res.json()) as EmsifaProvince[];
  provincesCache = rows.filter((p) => p.id && p.name);
  return provincesCache;
}

/**
 * Cocokkan nama provinsi aplikasi (INDONESIA_PROVINCES) → ID Kemendagri EMSIFA.
 * Contoh: "Jawa Barat" → "32", "DKI Jakarta" → "31".
 */
export async function resolveKemendagriProvinceId(
  provinceName: string
): Promise<string | null> {
  const target = normalizeWilayahName(provinceName);
  const provinces = await loadEmsifaProvinces();

  const exact = provinces.find(
    (p) => normalizeWilayahName(p.name) === target
  );
  if (exact) return exact.id;

  const partial = provinces.find((p) => {
    const n = normalizeWilayahName(p.name);
    return n.includes(target) || target.includes(n);
  });
  return partial?.id ?? null;
}

/** Ambil kabupaten/kota per provinsi Kemendagri — realtime dari EMSIFA. */
export async function fetchRegenciesByKemendagriProvince(
  kemendagriProvinceId: string
): Promise<EmsifaRegency[]> {
  const cached = regenciesCache.get(kemendagriProvinceId);
  if (cached) return cached;

  const res = await fetch(
    `${EMSIFA_BASE}/regencies/${kemendagriProvinceId}.json`,
    { cache: "force-cache", next: { revalidate: 86_400 } }
  );

  if (!res.ok) {
    throw new Error(`API wilayah kota gagal (${res.status})`);
  }

  const rows = (await res.json()) as EmsifaRegency[];
  const filtered = rows.filter((r) => r.id && r.name);
  regenciesCache.set(kemendagriProvinceId, filtered);
  return filtered;
}

/** Ambil kabupaten/kota berdasarkan nama provinsi (wrapper nyaman untuk Server Action). */
export async function fetchRegenciesByProvinceName(
  provinceName: string
): Promise<EmsifaRegency[]> {
  const kemId = await resolveKemendagriProvinceId(provinceName);
  if (!kemId) return [];
  return fetchRegenciesByKemendagriProvince(kemId);
}
