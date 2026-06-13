"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendAdminActivationEmail } from "@/app/actions/adminEmailActions";
import { verifyAdminSession, type AdminTier } from "@/app/utils/adminAuth";
import {
  getIndonesiaProvinceById,
  INDONESIA_PROVINCE_IDS,
} from "@/app/utils/indonesiaProvinces";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAdminJwtMetadata } from "@/lib/sync-admin-jwt-metadata";
import { resolveKemendagriProvinceId } from "@/lib/indonesia-wilayah-api";

const TIER_LABEL: Record<AdminTier, string> = {
  SUPER_ADMIN: "Super Admin",
  PROVINCE_ADMIN: "Province Admin",
  CITY_ADMIN: "City Admin",
};

const RecruitAdminSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120),
  email: z.email({ message: "Format email tidak valid" }).max(254),
  adminRole: z.enum(["PROVINCE_ADMIN", "CITY_ADMIN"], {
    message: "Tier admin tidak valid",
  }),
  provinceId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  cityName: z.string().trim().min(1).max(120).optional(),
});

export type RecruitAdminInput = z.infer<typeof RecruitAdminSchema>;

export type RecruitAdminResult =
  | { ok: true; userId: string; message: string }
  | { ok: false; error: string };

/**
 * Rekrutmen staf admin regional — buat akun Auth + profil + kirim email aktivasi.
 *
 * Lapisan keamanan:
 * 1. verifyAdminSession — hanya SUPER/PROVINCE admin yang boleh merekrut
 * 2. Geofencing tier — PROVINCE_ADMIN hanya boleh CITY_ADMIN di provinsinya
 * 3. Password sementara acak — tidak dikirim ke klien; aktivasi via token email
 * 4. Rollback berantai jika email gagal — tidak ada akun yatim tanpa instruksi
 */
export async function recruitNewAdmin(
  input: RecruitAdminInput
): Promise<RecruitAdminResult> {
  const session = await verifyAdminSession();

  if (session.adminRole === "CITY_ADMIN") {
    return { ok: false, error: "City Admin tidak berwenang merekrut staf" };
  }

  const parsed = RecruitAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input tidak valid",
    };
  }

  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  let provinceId = data.provinceId ?? null;
  let cityId = data.cityId ?? null;

  if (data.adminRole === "PROVINCE_ADMIN") {
    if (!provinceId || !INDONESIA_PROVINCE_IDS.has(provinceId)) {
      return { ok: false, error: "Provinsi wajib dipilih untuk Province Admin" };
    }
    cityId = null;
  }

  if (data.adminRole === "CITY_ADMIN") {
    if (!provinceId || !cityId) {
      return { ok: false, error: "Provinsi dan kota wajib dipilih untuk City Admin" };
    }
  }

  if (session.adminRole === "PROVINCE_ADMIN") {
    if (data.adminRole !== "CITY_ADMIN") {
      return {
        ok: false,
        error: "Province Admin hanya boleh merekrut City Admin",
      };
    }
    if (session.provinceId != null && provinceId !== session.provinceId) {
      return { ok: false, error: "Kota harus berada di provinsi yurisdiksi Anda" };
    }
    provinceId = session.provinceId ?? provinceId;
  }

  if (session.adminRole === "SUPER_ADMIN" && data.adminRole === "PROVINCE_ADMIN") {
    cityId = null;
  }

  const provinceMeta = provinceId
    ? getIndonesiaProvinceById(provinceId)
    : undefined;

  const admin = createAdminClient();

  if (provinceId && provinceMeta) {
    const { error: provErr } = await admin.from("provinces").upsert(
      { id: provinceMeta.id, name: provinceMeta.name },
      { onConflict: "name" }
    );
    if (provErr) {
      return { ok: false, error: provErr.message };
    }

    const kemProvId = await resolveKemendagriProvinceId(provinceMeta.name);
    if (kemProvId && Number(kemProvId) !== provinceMeta.id) {
      await admin.from("provinces").upsert(
        { id: Number(kemProvId), name: provinceMeta.name },
        { onConflict: "id" }
      );
    }
  }

  if (data.adminRole === "CITY_ADMIN" && cityId) {
    const kemProvId = provinceMeta
      ? await resolveKemendagriProvinceId(provinceMeta.name)
      : null;
    const cityProvinceId = kemProvId ? Number(kemProvId) : provinceId;
    const cityLabel =
      data.cityName?.trim() ||
      (await admin
        .from("cities")
        .select("name")
        .eq("id", cityId)
        .maybeSingle()
        .then((r) => r.data?.name)) ||
      `Kota ${cityId}`;

    if (cityProvinceId) {
      const { error: cityErr } = await admin.from("cities").upsert(
        {
          id: cityId,
          province_id: cityProvinceId,
          name: cityLabel,
          is_active: true,
        },
        { onConflict: "id" }
      );
      if (cityErr) {
        return { ok: false, error: cityErr.message };
      }
    }
  }

  const { data: emailUsed } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (emailUsed) {
    return { ok: false, error: "Email sudah terdaftar di sistem" };
  }

  const tempPassword = randomBytes(32).toString("base64url");

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: false,
    user_metadata: {
      name: data.name,
      role: "admin",
      admin_role: data.adminRole,
    },
  });

  if (createErr || !authUser?.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Gagal membuat akun otentikasi",
    };
  }

  const uid = authUser.user.id;

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: uid,
    email,
    name: data.name,
    phone: null,
    role: "admin",
    admin_role: data.adminRole,
    province_id: provinceId,
    city_id: cityId,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(uid);
    return { ok: false, error: profileErr.message };
  }

  try {
    await syncAdminJwtMetadata(admin, uid, {
      adminRole: data.adminRole,
      provinceId,
      cityId,
    });
  } catch {
    /* JWT sync best-effort — profiles tetap sumber kebenaran */
  }

  const scopeLabel =
    data.adminRole === "CITY_ADMIN" && cityId
      ? `${data.cityName?.trim() || `Kota ID ${cityId}`}, ${provinceMeta?.name ?? `Provinsi ${provinceId}`}`
      : provinceMeta?.name ?? `Provinsi ${provinceId}`;

  const mail = await sendAdminActivationEmail({
    userId: uid,
    recipientEmail: email,
    adminName: data.name,
    tierLabel: TIER_LABEL[data.adminRole],
    scopeLabel,
  });

  if (!mail.ok) {
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    return {
      ok: false,
      error: `Akun dibatalkan — email aktivasi gagal: ${mail.error}`,
    };
  }

  revalidatePath("/admin/recruit");

  return {
    ok: true,
    userId: uid,
    message: `Admin ${data.name} terdaftar. Email aktivasi dikirim ke ${email} (berlaku 24 jam).`,
  };
}
