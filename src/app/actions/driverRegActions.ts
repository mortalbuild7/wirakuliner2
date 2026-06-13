"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import {
  findActiveServiceCityByName,
  validateCityInLocalMaster,
} from "@/lib/regional-city-resolve";
import { serviceCityWithinAdminScope } from "@/lib/admin/regional-scope";
import { resolveClusterForServiceCity } from "@/lib/operational-cluster";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Action — Pendaftaran Driver Nasional dengan pemisahan armada fisik.
 *
 * Arsitektur operasional:
 * 1. `verifyAdminSession()`        → JWT divalidasi server-side + MFA aal2;
 *                                    aksi tidak pernah jalan tanpa admin sah.
 * 2. Validasi payload `zod`        → semua input dibersihkan & dibatasi
 *                                    sebelum menyentuh database otentikasi.
 * 3. Proteksi geofencing           → CITY_ADMIN dilarang keras mendaftarkan
 *                                    driver di luar city_id miliknya;
 *                                    PROVINCE_ADMIN dibatasi provinsinya.
 * 4. `auth.admin.createUser`       → akun dibuat di database otentikasi pusat
 *                                    (GoTrue) dengan metadata role driver +
 *                                    service_category armada fisik.
 * 5. Rollback berantai             → gagal di profil/armada = akun auth ikut
 *                                    dihapus; tidak ada akun yatim.
 */

/** Kategori armada fisik — satu driver satu kategori (anti-redundancy). */
const SERVICE_CATEGORIES = [
  "MOTOR_HYBRID",
  "MOBIL_PASSENGER",
  "MOBIL_CARGO",
] as const;

const DriverRegSchema = z.object({
  // Identitas operasional driver di lapangan.
  name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  // Nomor HP dipakai driver untuk klaim akun di app — wajib unik.
  phone: z
    .string()
    .trim()
    .min(8, "Nomor telepon minimal 8 digit")
    .max(20)
    .regex(/^[0-9+\-\s]+$/, "Nomor telepon hanya angka/+/-"),
  // Kredensial login akun otentikasi pusat.
  email: z.email({ message: "Format email tidak valid" }).max(254),
  password: z
    .string()
    .min(6, "Password minimal 6 karakter")
    .max(72, "Password maksimal 72 karakter"),
  // Plat opsional saat pendaftaran; wajib sebelum beroperasi.
  vehiclePlate: z.string().trim().max(20).optional(),
  // Pemisahan armada fisik — menentukan job mana yang boleh diterima dispatch:
  // MOTOR_HYBRID → NGOJEK + PAKET kecil; MOBIL_PASSENGER → NGOMOBIL;
  // MOBIL_CARGO → PAKET kubikasi besar (> 60.000 cm³).
  serviceCategory: z.enum(SERVICE_CATEGORIES, {
    message: "Kategori armada tidak valid",
  }),
  // Wilayah operasional — provinceId + cityName dari dropdown master lokal.
  provinceId: z
    .number({ message: "Provinsi wajib dipilih" })
    .int("ID provinsi harus bilangan bulat")
    .positive("Provinsi tidak valid"),
  cityName: z
    .string({ message: "Kota cabang wajib dipilih" })
    .trim()
    .min(2, "Kota cabang wajib dipilih")
    .max(120, "Nama kota terlalu panjang"),

  // ── LEGALITAS SIM (WAJIB) ───────────────────────────────────────────────
  // Nomor SIM: hanya digit (format nasional 8–16 digit) — non-digit ditolak.
  simNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{8,16}$/, "Nomor SIM wajib 8–16 digit angka"),
  // Masa berlaku: format ISO yyyy-mm-dd dan HARUS tanggal di masa depan —
  // SIM yang sudah/akan kedaluwarsa hari ini ditolak sejak pendaftaran.
  simExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal SIM tidak valid")
    .refine((d) => {
      const expiry = new Date(`${d}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return expiry.getTime() > today.getTime();
    }, "Masa berlaku SIM harus tanggal di masa depan"),
  // Bukti fisik: Public URL hasil upload ke bucket Storage 'driver-documents'.
  // Dikunci ke path bucket resmi → URL eksternal sembarang tidak diterima.
  simDocumentUrl: z
    .url({ message: "Dokumen SIM wajib diunggah" })
    .refine(
      (u) => u.includes("/storage/v1/object/public/driver-documents/"),
      "URL dokumen SIM harus berasal dari penyimpanan resmi driver-documents"
    ),
});

export type DriverRegInput = z.infer<typeof DriverRegSchema>;

export type DriverRegResult =
  | { ok: true; driverId: string; userId: string; message: string }
  | { ok: false; error: string };

/** Normalisasi ID provinsi dari form sebelum zod. */
function coerceRegionalIds(raw: DriverRegInput | Record<string, unknown>) {
  return {
    ...raw,
    provinceId: Number((raw as { provinceId?: unknown }).provinceId),
  };
}

export async function registerDriverNational(
  input: DriverRegInput
): Promise<DriverRegResult> {
  // ── 1. AUTENTIKASI: hanya sesi admin valid (semua tier) yang lolos. ──────
  const session = await verifyAdminSession();

  // ── 2. VALIDASI PAYLOAD: tolak dini dengan pesan terarah per field. ──────
  const parsed = DriverRegSchema.safeParse(coerceRegionalIds(input));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input tidak valid",
    };
  }
  const data = parsed.data;
  const phone = data.phone.replace(/\s/g, "");

  const localCity = validateCityInLocalMaster(data.provinceId, data.cityName);
  if (!localCity.ok) {
    return { ok: false, error: localCity.error };
  }

  const admin = createAdminClient();

  // ── 3. GEOFENCING: zona layanan aktif dari `service_cities` (sumber kebenaran). ─
  const city = await findActiveServiceCityByName(
    data.provinceId,
    localCity.canonicalName
  );

  if (!city || city.city_id == null || city.province_id == null) {
    return {
      ok: false,
      error:
        "Zona layanan GPS belum aktif untuk kota ini. Tambahkan di Manajemen Kota Layanan.",
    };
  }

  const cityLabel = (city.name.split(",")[0] ?? city.name).trim();
  const { error: citySyncErr } = await admin.from("cities").upsert(
    {
      id: city.city_id,
      province_id: city.province_id,
      name: cityLabel,
      is_active: true,
    },
    { onConflict: "id" }
  );

  if (citySyncErr) {
    return { ok: false, error: citySyncErr.message };
  }

  // CITY_ADMIN → city.city_id wajib sama dengan session.cityId;
  // PROVINCE_ADMIN → wajib satu provinsi; SUPER_ADMIN → bebas nasional.
  if (!serviceCityWithinAdminScope(session, city)) {
    return {
      ok: false,
      error: "Ditolak: kota layanan di luar yurisdiksi wilayah Anda",
    };
  }

  // ── 4. ANTI-DUPLIKAT: satu nomor HP = satu armada (kunci klaim akun). ────
  const { data: phoneUsed } = await admin
    .from("drivers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (phoneUsed) {
    return { ok: false, error: "Nomor telepon sudah terdaftar sebagai driver" };
  }

  // ── 5. AKUN OTENTIKASI PUSAT: createUser via service role (GoTrue admin). ─
  // email_confirm: true → driver langsung bisa login tanpa link verifikasi
  // (akun dibuat & diverifikasi langsung oleh admin operasional).
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser(
    {
      email: data.email,
      password: data.password,
      email_confirm: true,
      // Metadata disematkan ke JWT — role driver + jenis armada fisik
      // terbaca oleh edge function / klien tanpa query tambahan.
      user_metadata: {
        name: data.name,
        role: "driver",
        service_category: data.serviceCategory,
      },
    }
  );

  if (createErr || !authUser?.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Gagal membuat akun otentikasi",
    };
  }
  const uid = authUser.user.id;

  // ── 6. PROFIL APLIKASI: baris profiles menjadi sumber kebenaran role. ────
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: uid,
    email: data.email,
    name: data.name,
    phone,
    role: "driver",
  });

  if (profileErr) {
    // Rollback: akun auth dihapus agar tidak ada akun tanpa profil.
    await admin.auth.admin.deleteUser(uid);
    return { ok: false, error: profileErr.message };
  }

  // ── 7. ARMADA: baris drivers + cluster operasional + kota pendaftaran. ───
  const operationalClusterId =
    (city as { operational_cluster_id?: string | null }).operational_cluster_id ??
    (await resolveClusterForServiceCity(admin, city.id));

  const { data: driver, error: driverErr } = await admin
    .from("drivers")
    .insert({
      profile_id: uid,
      name: data.name,
      phone,
      vehicle_plate: data.vehiclePlate?.trim() || null,
      sim_number: data.simNumber,
      sim_expiry_date: data.simExpiryDate,
      sim_document_url: data.simDocumentUrl,
      service_category: data.serviceCategory,
      service_city_id: city.id,
      registration_service_city_id: city.id,
      registration_province_id: city.province_id,
      operational_cluster_id: operationalClusterId,
      province_id: city.province_id,
      city_id: city.city_id,
      status: "offline",
    })
    .select("id")
    .single();

  if (driverErr || !driver) {
    // Rollback berantai: profil + akun auth dibersihkan (tidak ada yatim).
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    return {
      ok: false,
      error: driverErr?.message ?? "Gagal menyimpan data armada",
    };
  }

  // ── 8. SINKRONISASI UI: tabel driver dirender ulang dari data terbaru. ───
  revalidatePath("/admin/drivers");

  return {
    ok: true,
    driverId: driver.id,
    userId: uid,
    message: `Driver ${data.name} (${data.serviceCategory}) terdaftar di ${city.name}.`,
  };
}

/** Alias operasional — sama dengan registerDriverNational. */
export async function registerNewDriver(
  input: DriverRegInput
): Promise<DriverRegResult> {
  return registerDriverNational(input);
}
