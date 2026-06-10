"use server";

/**
 * Server Actions — Tarif Regional (PROVINCE_ADMIN / SUPER_ADMIN)
 *
 * Keamanan:
 * 1. `requireRegionalAdmin()` — JWT + tier + MFA
 * 2. Zod strict — tolak over-posting & angka negatif
 * 3. Cross-check province_id: PROVINCE_ADMIN tidak boleh ubah kota luar provinsi
 * 4. CITY_ADMIN ditolak keras (403) — tidak boleh mutasi tarif
 * 5. Audit trail ke admin_audit_logs
 */

import { revalidatePath } from "next/cache";
import { recordAdminAudit } from "@/lib/admin-audit";
import { updateRegionalTariffSchema } from "@/lib/admin/regional-tariff-schemas";
import { requireRegionalAdmin } from "@/app/utils/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export type TariffActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function updateRegionalTariff(
  raw: unknown
): Promise<TariffActionResult> {
  const auth = await requireRegionalAdmin();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (auth.adminRole === "CITY_ADMIN") {
    return {
      ok: false,
      error: "CITY_ADMIN dilarang mengubah tarif regional",
    };
  }

  const parsed = updateRegionalTariffSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid" };
  }

  const {
    provinceId,
    cityId,
    baseFare,
    pricePerKm,
    merchantMarkup,
    tariffId,
    serviceType,
  } = parsed.data;

  if (
    auth.adminRole === "PROVINCE_ADMIN" &&
    auth.provinceId != null &&
    provinceId !== auth.provinceId
  ) {
    return {
      ok: false,
      error: "PROVINCE_ADMIN tidak boleh mengubah tarif di luar provinsi tugas",
    };
  }

  const admin = getSupabaseAdmin();

  if (cityId != null) {
    const { data: city } = await admin
      .from("cities")
      .select("id, province_id")
      .eq("id", cityId)
      .maybeSingle();

    if (!city || city.province_id !== provinceId) {
      return {
        ok: false,
        error: "city_id tidak berada di dalam province_id yang diminta",
      };
    }
  }

  const patch = {
    province_id: provinceId,
    city_id: cityId ?? null,
    service_type: serviceType,
    base_fare: baseFare,
    price_per_km: pricePerKm,
    merchant_markup: merchantMarkup,
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  };

  let errorMsg: string | null = null;

  if (tariffId) {
    const { error } = await admin
      .from("regional_tariffs")
      .update(patch)
      .eq("id", tariffId)
      .eq("province_id", provinceId)
      .eq("service_type", serviceType);
    errorMsg = error?.message ?? null;
  } else {
    let lookup = admin
      .from("regional_tariffs")
      .select("id")
      .eq("province_id", provinceId)
      .eq("service_type", serviceType);

    lookup =
      cityId == null ? lookup.is("city_id", null) : lookup.eq("city_id", cityId);

    const { data: existing } = await lookup.maybeSingle();

    if (existing?.id) {
      const { error } = await admin
        .from("regional_tariffs")
        .update(patch)
        .eq("id", existing.id);
      errorMsg = error?.message ?? null;
    } else {
      const { error } = await admin.from("regional_tariffs").insert(patch);
      errorMsg = error?.message ?? null;
    }
  }

  if (errorMsg) {
    return { ok: false, error: errorMsg };
  }

  await recordAdminAudit(admin, {
    adminId: auth.userId,
    adminRole: auth.adminRole,
    action: "UPDATE_REGIONAL_TARIFF",
    entityTable: "regional_tariffs",
    entityId: tariffId ?? `${provinceId}:${cityId ?? "provincial"}:${serviceType}`,
    provinceId,
    cityId: cityId ?? null,
    payload: { serviceType, baseFare, pricePerKm, merchantMarkup },
  });

  revalidatePath("/admin/tariffs");
  return { ok: true, message: "Tarif regional diperbarui" };
}
