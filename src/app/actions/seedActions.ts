"use server";

import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { JALAN_WIRA } from "@/lib/geo-config";

/**
 * Server Action — Seed / bypass migrasi regional admin.
 *
 * Menggunakan `createAdminClient()` (= SUPABASE_SERVICE_ROLE_KEY) sehingga
 * INSERT/UPSERT tembus RLS tanpa terblokir kebijakan `authenticated`.
 *
 * Data master:
 *   - 4 provinsi di tabel `provinces`
 *   - 6 kota referensi di tabel `cities`
 *   - 6 zona layanan aktif di tabel `service_cities` (dropdown driver)
 */

/** 4 provinsi master — ID kode Kemendagri. */
const PROVINCE_SEEDS = [
  { id: 31, name: "DKI Jakarta" },
  { id: 32, name: "Jawa Barat" },
  { id: 33, name: "Jawa Tengah" },
  { id: 35, name: "Jawa Timur" },
] as const;

/** 6 kota referensi — FK `province_id` → `provinces.id`. */
const CITY_SEEDS = [
  { id: 3174, province_id: 31, name: "Jakarta Selatan" },
  { id: 3271, province_id: 32, name: "Kota Bogor" },
  { id: 3273, province_id: 32, name: "Bandung" },
  { id: 3374, province_id: 33, name: "Kota Semarang" },
  { id: 3578, province_id: 35, name: "Kota Malang" },
  { id: 3579, province_id: 35, name: "Surabaya" },
] as const;

/** 6 zona layanan operasional — dipakai pendaftaran driver & merchant. */
const SERVICE_CITY_SEEDS = [
  {
    name: "Parung, Bogor",
    slug: "parung-bogor",
    province_id: 32,
    city_id: 3271,
    center_lat: JALAN_WIRA.latitude,
    center_lng: JALAN_WIRA.longitude,
    radius_km: 12,
    is_active: true,
  },
  {
    name: "Jakarta Selatan, DKI Jakarta",
    slug: "jakarta-selatan",
    province_id: 31,
    city_id: 3174,
    center_lat: -6.2615,
    center_lng: 106.8106,
    radius_km: 12,
    is_active: true,
  },
  {
    name: "Bandung, Jawa Barat",
    slug: "bandung",
    province_id: 32,
    city_id: 3273,
    center_lat: -6.9175,
    center_lng: 107.6191,
    radius_km: 12,
    is_active: true,
  },
  {
    name: "Kota Semarang, Jawa Tengah",
    slug: "kota-semarang",
    province_id: 33,
    city_id: 3374,
    center_lat: -6.9667,
    center_lng: 110.4167,
    radius_km: 12,
    is_active: true,
  },
  {
    name: "Kota Malang, Jawa Timur",
    slug: "kota-malang",
    province_id: 35,
    city_id: 3578,
    center_lat: -7.9666,
    center_lng: 112.6326,
    radius_km: 12,
    is_active: true,
  },
  {
    name: "Surabaya, Jawa Timur",
    slug: "surabaya",
    province_id: 35,
    city_id: 3579,
    center_lat: -7.2575,
    center_lng: 112.7521,
    radius_km: 12,
    is_active: true,
  },
] as const;

export type RegionalSeedResult =
  | {
      ok: true;
      seeded: boolean;
      message: string;
      counts: { provinces: number; cities: number; serviceCities: number };
    }
  | { ok: false; error: string };

export type RegionalSeedStatus = {
  needsSeed: boolean;
  isSuperAdmin: boolean;
  counts: { provinces: number; cities: number; serviceCities: number };
};

/** Cek status seed via service role — akurat walau RLS blokir client anon. */
export async function checkRegionalSeedStatus(): Promise<RegionalSeedStatus> {
  const session = await verifyAdminSession();
  const admin = createAdminClient();

  const [prov, city, svc] = await Promise.all([
    admin.from("provinces").select("*", { count: "exact", head: true }),
    admin.from("cities").select("*", { count: "exact", head: true }),
    admin.from("service_cities").select("*", { count: "exact", head: true }),
  ]);

  const counts = {
    provinces: prov.count ?? 0,
    cities: city.count ?? 0,
    serviceCities: svc.count ?? 0,
  };

  const needsSeed =
    counts.provinces < PROVINCE_SEEDS.length ||
    counts.cities < CITY_SEEDS.length ||
    counts.serviceCities < SERVICE_CITY_SEEDS.length;

  return {
    needsSeed,
    isSuperAdmin: session.adminRole === "SUPER_ADMIN",
    counts,
  };
}

export async function runRegionalMigrationSeed(): Promise<RegionalSeedResult> {
  // ── 1. AUTENTIKASI: hanya SUPER_ADMIN boleh menjalankan bypass seed. ───────
  await verifyAdminSession({ requireSuperAdmin: true });

  // ── 2. SERVICE ROLE: bypass RLS — kunci SUPABASE_SERVICE_ROLE_KEY. ────────
  const admin = createAdminClient();

  // ── 3. UPSERT PROVINSI (idempotent — aman dijalankan berulang). ───────────
  const { error: provErr } = await admin
    .from("provinces")
    .upsert([...PROVINCE_SEEDS], { onConflict: "id" });

  if (provErr) {
    return { ok: false, error: `Provinsi: ${provErr.message}` };
  }

  // ── 4. UPSERT KOTA REFERENSI. ─────────────────────────────────────────────
  const { error: cityErr } = await admin
    .from("cities")
    .upsert([...CITY_SEEDS], { onConflict: "id" });

  if (cityErr) {
    return { ok: false, error: `Kota: ${cityErr.message}` };
  }

  // ── 5. UPSERT ZONA LAYANAN — slug UNIQUE, is_active=true. ─────────────────
  const { error: svcErr } = await admin
    .from("service_cities")
    .upsert([...SERVICE_CITY_SEEDS], { onConflict: "slug" });

  if (svcErr) {
    return { ok: false, error: `Kota layanan: ${svcErr.message}` };
  }

  // ── 6. Verifikasi pasca-seed via service role. ────────────────────────────
  const [prov, city, svc] = await Promise.all([
    admin.from("provinces").select("*", { count: "exact", head: true }),
    admin.from("cities").select("*", { count: "exact", head: true }),
    admin.from("service_cities").select("*", { count: "exact", head: true }),
  ]);

  const counts = {
    provinces: prov.count ?? 0,
    cities: city.count ?? 0,
    serviceCities: svc.count ?? 0,
  };

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/admin/dashboard/cities");
  revalidatePath("/admin/drivers/new");

  return {
    ok: true,
    seeded: true,
    message: `Migrasi regional selesai — ${counts.provinces} provinsi, ${counts.cities} kota, ${counts.serviceCities} zona layanan aktif.`,
    counts,
  };
}
