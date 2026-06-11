/**
 * Master data 38 provinsi Indonesia — sumber tunggal dropdown form & validasi server.
 * ID 1–38 (urutan aplikasi): DKI Jakarta → … → Papua Barat Daya.
 */

export type IndonesiaProvince = {
  /** Primary key referensi di tabel `provinces.id`. */
  id: number;
  /** Nama resmi provinsi — UNIQUE di database. */
  name: string;
};

export const INDONESIA_PROVINCES: readonly IndonesiaProvince[] = [
  { id: 1, name: "DKI Jakarta" },
  { id: 2, name: "Jawa Timur" },
  { id: 3, name: "Jawa Barat" },
  { id: 4, name: "Jawa Tengah" },
  { id: 5, name: "DI Yogyakarta" },
  { id: 6, name: "Banten" },
  { id: 7, name: "Bali" },
  { id: 8, name: "Nusa Tenggara Barat" },
  { id: 9, name: "Nusa Tenggara Timur" },
  { id: 10, name: "Sumatera Utara" },
  { id: 11, name: "Sumatera Barat" },
  { id: 12, name: "Riau" },
  { id: 13, name: "Kepulauan Riau" },
  { id: 14, name: "Jambi" },
  { id: 15, name: "Sumatera Selatan" },
  { id: 16, name: "Kepulauan Bangka Belitung" },
  { id: 17, name: "Bengkulu" },
  { id: 18, name: "Lampung" },
  { id: 19, name: "Aceh" },
  { id: 20, name: "Kalimantan Barat" },
  { id: 21, name: "Kalimantan Tengah" },
  { id: 22, name: "Kalimantan Selatan" },
  { id: 23, name: "Kalimantan Timur" },
  { id: 24, name: "Kalimantan Utara" },
  { id: 25, name: "Sulawesi Utara" },
  { id: 26, name: "Gorontalo" },
  { id: 27, name: "Sulawesi Tengah" },
  { id: 28, name: "Sulawesi Barat" },
  { id: 29, name: "Sulawesi Selatan" },
  { id: 30, name: "Sulawesi Tenggara" },
  { id: 31, name: "Maluku" },
  { id: 32, name: "Maluku Utara" },
  { id: 33, name: "Papua" },
  { id: 34, name: "Papua Barat" },
  { id: 35, name: "Papua Selatan" },
  { id: 36, name: "Papua Tengah" },
  { id: 37, name: "Papua Pegunungan" },
  { id: 38, name: "Papua Barat Daya" },
] as const;

const PROVINCE_BY_ID = new Map(
  INDONESIA_PROVINCES.map((p) => [p.id, p] as const)
);

/** Lookup provinsi valid dari ID dropdown — dipakai Server Action sebelum upsert. */
export function getIndonesiaProvinceById(
  id: number
): IndonesiaProvince | undefined {
  return PROVINCE_BY_ID.get(id);
}

/** Set ID valid untuk validasi zod (1–38). */
export const INDONESIA_PROVINCE_IDS = new Set(
  INDONESIA_PROVINCES.map((p) => p.id)
);
