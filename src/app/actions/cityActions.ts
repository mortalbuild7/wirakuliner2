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

/** Slug URL aman dari nama kota — dipakai kolom service_cities.slug (UNIQUE). */
function slugifyCity(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const normalizedName = cityName.trim();

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
    return {
      ok: false,
      error: `Kota layanan "${existingService.name}" sudah aktif di ${province.name}`,
    };
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

  // ── 8. SINKRONISASI UI: dropdown kota di form driver & halaman ini. ────────
  revalidatePath("/admin/dashboard/cities");
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/drivers/new");

  return {
    ok: true,
    cityId,
    serviceCityId: serviceCity.id,
    message: `Kota layanan "${displayName}" berhasil ditambahkan.`,
  };
}
