"use server";

import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Action — Seed data regional awal (provinsi + kota referensi).
 *
 * Dipicu manual oleh SUPER_ADMIN dari banner dashboard ketika tabel
 * `provinces` / `cities` masih kosong (DB baru / migrasi belum di-seed).
 *
 * Alur operasional:
 *   1. verifyAdminSession({ requireSuperAdmin: true }) — hanya nasional.
 *   2. Hitung baris existing di `provinces` dan `cities`.
 *   3. Insert hanya tabel yang masih kosong (idempotent / aman diulang).
 *   4. revalidatePath agar banner hilang & dropdown kota terisi.
 */

/** Baris seed provinsi — ID mengikuti kode Kemendagri (integer PK). */
const PROVINCE_SEEDS = [
  { id: 31, name: "DKI Jakarta" },
  { id: 32, name: "Jawa Barat" },
  { id: 35, name: "Jawa Timur" },
] as const;

/**
 * Baris seed kota — `province_id` → FK ke `provinces.id`.
 * ID kota juga integer PK resmi (kode wilayah administratif).
 */
const CITY_SEEDS = [
  { id: 3174, province_id: 31, name: "Jakarta Selatan" },
  { id: 3273, province_id: 32, name: "Bandung" },
  { id: 3578, province_id: 35, name: "Kota Malang" },
  { id: 3579, province_id: 35, name: "Surabaya" },
] as const;

export type RegionalSeedResult =
  | { ok: true; seeded: boolean; message: string }
  | { ok: false; error: string };

export async function runRegionalMigrationSeed(): Promise<RegionalSeedResult> {
  // ── 1. AUTENTIKASI: seed basis data HANYA untuk SUPER_ADMIN. ─────────────
  await verifyAdminSession({ requireSuperAdmin: true });

  const admin = createAdminClient();

  // ── 2. DETEKSI KOSONG: hitung baris tanpa mengambil seluruh dataset. ───────
  const { count: provinceCount, error: provCountErr } = await admin
    .from("provinces")
    .select("*", { count: "exact", head: true });

  if (provCountErr) {
    return { ok: false, error: provCountErr.message };
  }

  const { count: cityCount, error: cityCountErr } = await admin
    .from("cities")
    .select("*", { count: "exact", head: true });

  if (cityCountErr) {
    return { ok: false, error: cityCountErr.message };
  }

  const provincesEmpty = (provinceCount ?? 0) === 0;
  const citiesEmpty = (cityCount ?? 0) === 0;

  // Kedua tabel sudah terisi — tidak perlu mutasi ulang.
  if (!provincesEmpty && !citiesEmpty) {
    return {
      ok: true,
      seeded: false,
      message: "Data provinsi dan kota sudah tersedia — seed dilewati.",
    };
  }

  // ── 3. INSERT PROVINSI: hanya jika tabel `provinces` kosong. ──────────────
  if (provincesEmpty) {
    const { error: provInsertErr } = await admin
      .from("provinces")
      .insert([...PROVINCE_SEEDS]);

    if (provInsertErr) {
      return { ok: false, error: provInsertErr.message };
    }
  }

  // ── 4. INSERT KOTA: hanya jika tabel `cities` kosong. ─────────────────────
  // Provinsi harus sudah ada (baris di atas atau dari migrasi sebelumnya).
  if (citiesEmpty) {
    const { error: cityInsertErr } = await admin
      .from("cities")
      .insert([...CITY_SEEDS]);

    if (cityInsertErr) {
      return { ok: false, error: cityInsertErr.message };
    }
  }

  // ── 5. SINKRONISASI UI: banner dashboard & form manajemen kota. ──────────
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/admin/dashboard/cities");

  return {
    ok: true,
    seeded: true,
    message:
      "Migrasi basis data regional selesai — 3 provinsi dan 4 kota referensi ditambahkan.",
  };
}
