"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import {
  getIndonesiaProvinceById,
  INDONESIA_PROVINCE_IDS,
} from "@/app/utils/indonesiaProvinces";
import { createAdminClient } from "@/lib/supabase/admin";
import { JALAN_WIRA } from "@/lib/geo-config";
import { getCitiesByProvinceId } from "@/lib/indonesia-regions";
import { validateCityInLocalMaster } from "@/lib/regional-city-resolve";
import {
  formatWilayahCityName,
  normalizeCityNameForDedup,
  SERVICE_CITY_DUPLICATE_ERROR,
} from "@/lib/wilayah-city-format";

export type WilayahRegencyOption = {
  kemendagriId: string;
  name: string;
};

/**
 * Server Action — Manajemen Kota Layanan (SUPER_ADMIN only).
 *
 * Arsitektur data dua lapisan:
 *   1. `cities`         → referensi wilayah administratif (province_id + nama kota).
 *   2. `service_cities` → zona operasional GPS yang dipakai driver/merchant/dispatch.
 *
 * Alur operasional:
 *   1. verifyAdminSession({ requireSuperAdmin: true }) — hanya SUPER_ADMIN boleh mutasi.
 *   2. Validasi zod — provinceId integer positif + nama kota 2–120 karakter.
 *   3. Cek provinsi induk ada di tabel `provinces`.
 *   4. Upsert referensi `cities` — pakai baris existing jika nama sudah ada di provinsi.
 *   5. Buat baris `service_cities` terhubung province_id/city_id agar dropdown
 *      pendaftaran driver langsung punya kota aktif.
 */

/** Payload form: provinsi induk (integer ID) + nama kota baru. */
const CreateCitySchema = z.object({
  provinceId: z
    .number({ message: "Provinsi wajib dipilih" })
    .int("ID provinsi harus bilangan bulat")
    .refine(
      (id) => INDONESIA_PROVINCE_IDS.has(id),
      "Provinsi tidak valid — pilih dari daftar 38 provinsi"
    ),
  cityName: z
    .string()
    .trim()
    .min(2, "Nama kota minimal 2 karakter")
    .max(120, "Nama kota maksimal 120 karakter"),
});

export type CreateCityInput = z.infer<typeof CreateCitySchema>;

export type CreateCityResult =
  | { ok: true; cityId: number; serviceCityId: string; message: string }
  | { ok: false; error: string };

export type DeleteServiceCityResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const DeleteServiceCitySchema = z.object({
  serviceCityId: z.string().uuid("ID kota layanan tidak valid"),
});

/** Slug URL aman dari nama kota — dipakai kolom service_cities.slug (UNIQUE). */
function slugifyCity(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Cek duplikat zona layanan berdasarkan nama provinsi + nama kota (abaikan city_id). */
async function findDuplicateServiceCity(
  admin: ReturnType<typeof createAdminClient>,
  provinceId: number,
  provinceName: string,
  cityName: string
): Promise<{ id: string; name: string } | null> {
  const targetCityKey = normalizeCityNameForDedup(cityName);
  const targetProvinceKey = provinceName.trim().toLowerCase();

  const { data: rows, error } = await admin
    .from("service_cities")
    .select("id, name, provinces(name)")
    .eq("province_id", provinceId);

  if (error) throw new Error(error.message);

  for (const row of rows ?? []) {
    const prov = row.provinces as
      | { name: string }
      | { name: string }[]
      | null;
    const provName = (Array.isArray(prov) ? prov[0]?.name : prov?.name) ?? "";
    if (provName.trim().toLowerCase() !== targetProvinceKey) continue;

    const cityPart = (row.name.split(",")[0] ?? row.name).trim();
    if (normalizeCityNameForDedup(cityPart) === targetCityKey) {
      return { id: row.id, name: row.name };
    }
  }

  return null;
}

/** Dropdown dinamis — kabupaten/kota per provinsi dari master lokal (tanpa API eksternal). */
export async function getRegenciesForServiceCityForm(
  provinceId: number
): Promise<
  | { ok: true; regencies: WilayahRegencyOption[] }
  | { ok: false; error: string }
> {
  await verifyAdminSession({ requireSuperAdmin: true });

  const pid = Number(provinceId);
  if (!Number.isInteger(pid) || pid <= 0 || !INDONESIA_PROVINCE_IDS.has(pid)) {
    return { ok: false, error: "Provinsi tidak valid" };
  }

  const provinceMeta = getIndonesiaProvinceById(pid);
  if (!provinceMeta) {
    return { ok: false, error: "Provinsi tidak ditemukan" };
  }

  const cities = getCitiesByProvinceId(pid);
  if (!cities.length) {
    return {
      ok: false,
      error: `Tidak ada kota/kabupaten untuk ${provinceMeta.name}`,
    };
  }

  const regencies = cities.map((name, index) => ({
    kemendagriId: `${pid}-${index}`,
    name,
  }));

  return { ok: true, regencies };
}

export async function createServiceCity(
  input: CreateCityInput
): Promise<CreateCityResult> {
  // ── 1. AUTENTIKASI: mutasi kota HANYA untuk SUPER_ADMIN nasional. ─────────
  await verifyAdminSession({ requireSuperAdmin: true });

  // ── 2. VALIDASI PAYLOAD: tolak dini sebelum menyentuh database. ───────────
  const parsed = CreateCitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input tidak valid",
    };
  }
  const { provinceId, cityName } = parsed.data;

  const localCity = validateCityInLocalMaster(provinceId, cityName);
  if (!localCity.ok) {
    return { ok: false, error: localCity.error };
  }
  const normalizedName = localCity.canonicalName;

  const admin = createAdminClient();

  // ── 3. MASTER PROVINSI: resolve nama dari konstanta (bukan input bebas). ───
  const provinceMeta = getIndonesiaProvinceById(provinceId);
  if (!provinceMeta) {
    return { ok: false, error: "Provinsi induk tidak valid" };
  }

  // ── 4. UPSERT PROVINSI: pastikan baris ada sebelum FK `cities` — anti duplikat
  //    nama & hindari pelanggaran foreign key (`onConflict: 'name'`). ─────────
  const { data: province, error: provUpsertErr } = await admin
    .from("provinces")
    .upsert(
      { id: provinceMeta.id, name: provinceMeta.name },
      { onConflict: "name" }
    )
    .select("id, name")
    .single();

  if (provUpsertErr || !province) {
    return {
      ok: false,
      error: provUpsertErr?.message ?? "Gagal menyimpan provinsi induk",
    };
  }

  // ID efektif dari DB setelah upsert — dipakai semua FK berikutnya.
  const resolvedProvinceId = province.id;

  // ── 4b. ANTI-DUPLIKAT nama provinsi + nama kota (sebelum INSERT apa pun). ───
  try {
    const duplicate = await findDuplicateServiceCity(
      admin,
      resolvedProvinceId,
      province.name,
      normalizedName
    );
    if (duplicate) {
      return { ok: false, error: SERVICE_CITY_DUPLICATE_ERROR };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal memeriksa duplikat kota",
    };
  }

  // ── 5. REFERENSI `cities`: pakai baris existing atau buat baru. ───────────
  const { data: existingCity } = await admin
    .from("cities")
    .select("id, name")
    .eq("province_id", resolvedProvinceId)
    .ilike("name", normalizedName)
    .maybeSingle();

  let cityId = existingCity?.id ?? null;

  if (!cityId) {
    // ID baru = MAX(id)+1 — skema cities memakai INTEGER PK manual (kode wilayah).
    const { data: maxRow } = await admin
      .from("cities")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    cityId = (maxRow?.id ?? 900000) + 1;

    const { error: cityErr } = await admin.from("cities").insert({
      id: cityId,
      province_id: resolvedProvinceId,
      name: normalizedName,
      is_active: true,
    });

    if (cityErr) {
      return { ok: false, error: cityErr.message };
    }
  }

  // ── 6. ANTI-DUPLIKAT `service_cities` per pasangan province_id + city_id. ─
  const { data: existingService } = await admin
    .from("service_cities")
    .select("id, name")
    .eq("province_id", resolvedProvinceId)
    .eq("city_id", cityId)
    .maybeSingle();

  if (existingService) {
    return { ok: false, error: SERVICE_CITY_DUPLICATE_ERROR };
  }

  // ── 7. ZONA OPERASIONAL: baris service_cities agar driver bisa didaftarkan. ─
  const displayName = `${normalizedName}, ${province.name}`;
  const baseSlug = slugifyCity(`${normalizedName}-${province.name}`);
  const slug = `${baseSlug}-${cityId}`;

  const { data: serviceCity, error: serviceErr } = await admin
    .from("service_cities")
    .insert({
      name: displayName,
      slug,
      province_id: resolvedProvinceId,
      city_id: cityId,
      // Koordinat default — admin dapat sesuaikan nanti di halaman detail peta.
      center_lat: JALAN_WIRA.latitude,
      center_lng: JALAN_WIRA.longitude,
      radius_km: 12,
      is_active: true,
    })
    .select("id")
    .single();

  if (serviceErr || !serviceCity) {
    return {
      ok: false,
      error: serviceErr?.message ?? "Gagal membuat zona layanan",
    };
  }

  await admin.from("cities").update({ is_active: true }).eq("id", cityId);

  // ── 8. SINKRONISASI UI: dropdown kota di form driver & halaman ini. ────────
  revalidatePath("/admin/dashboard/cities");
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/drivers/new");
  revalidatePath("/dashboard/drivers/new");

  return {
    ok: true,
    cityId,
    serviceCityId: serviceCity.id,
    message: `Kota layanan "${displayName}" berhasil ditambahkan.`,
  };
}

/** Hapus zona layanan — hanya SUPER_ADMIN; blokir jika masih ada driver/merchant terikat. */
export async function deleteServiceCity(
  serviceCityId: string
): Promise<DeleteServiceCityResult> {
  await verifyAdminSession({ requireSuperAdmin: true });

  const parsed = DeleteServiceCitySchema.safeParse({ serviceCityId });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "ID kota layanan tidak valid",
    };
  }

  const admin = createAdminClient();

  const { data: zone, error: zoneErr } = await admin
    .from("service_cities")
    .select("id, name, city_id")
    .eq("id", parsed.data.serviceCityId)
    .maybeSingle();

  if (zoneErr) {
    return { ok: false, error: zoneErr.message };
  }
  if (!zone) {
    return { ok: false, error: "Kota layanan tidak ditemukan" };
  }

  const { data: boundDriverRows, error: driverErr } = await admin
    .from("drivers")
    .select("id")
    .or(
      `service_city_id.eq.${zone.id},registration_service_city_id.eq.${zone.id}`
    );

  if (driverErr) {
    return { ok: false, error: driverErr.message };
  }

  const { count: merchantCount, error: merchantErr } = await admin
    .from("merchants")
    .select("id", { count: "exact", head: true })
    .eq("service_city_id", zone.id);

  if (merchantErr) {
    return { ok: false, error: merchantErr.message };
  }

  const boundDrivers = boundDriverRows?.length ?? 0;
  const boundMerchants = merchantCount ?? 0;

  if (boundDrivers > 0 || boundMerchants > 0) {
    const parts: string[] = [];
    if (boundDrivers > 0) parts.push(`${boundDrivers} driver`);
    if (boundMerchants > 0) parts.push(`${boundMerchants} merchant`);
    return {
      ok: false,
      error: `Tidak dapat menghapus: masih ada ${parts.join(" dan ")} yang terikat dengan kota layanan ini.`,
    };
  }

  const { error: delErr } = await admin
    .from("service_cities")
    .delete()
    .eq("id", zone.id);

  if (delErr) {
    return { ok: false, error: delErr.message };
  }

  revalidatePath("/admin/dashboard/cities");
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/drivers/new");
  revalidatePath("/dashboard/drivers/new");
  revalidatePath("/admin/recruit");

  return {
    ok: true,
    message: `Kota layanan "${zone.name}" berhasil dihapus.`,
  };
}

/** Alias dokumentasi — payload: provinsi (ID) + nama kota. */
export const addServiceCity = createServiceCity;
