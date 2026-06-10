"use server";

import { revalidatePath } from "next/cache";
import { requireAnyAdmin } from "@/lib/admin-auth";
import { entityWithinAdminScope } from "@/lib/admin/regional-scope";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import {
  verifyMerchantSchema,
  verifyDriverSchema,
  buildMerchantVerificationPatch,
  buildDriverVerificationPatch,
} from "@/lib/admin/schemas";

/**
 * Server Actions admin — jalur mutasi data sensitif.
 *
 * Alur keamanan:
 * 1. `requireSuperAdmin()` — verifikasi JWT + role di `profiles` (bukan client state)
 * 2. Zod `.strict()` — buang mass-assignment / parameter ilegal
 * 3. `getSupabaseAdmin()` — service role hanya setelah auth lolos
 * 4. Patch whitelist — hanya kolom yang diizinkan dikirim ke `.update()`
 */

export type AdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function verifyMerchant(
  raw: unknown
): Promise<AdminActionResult> {
  const auth = await requireAnyAdmin();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  const parsed = verifyMerchantSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid" };
  }

  const { merchantId } = parsed.data;
  const admin = getSupabaseAdmin();

  const { data: merchant, error: fetchErr } = await admin
    .from("merchants")
    .select("id, owner_id, province_id, city_id")
    .eq("id", merchantId)
    .maybeSingle();

  if (fetchErr || !merchant) {
    return { ok: false, error: "Merchant tidak ditemukan" };
  }

  if (!entityWithinAdminScope(auth, merchant)) {
    return { ok: false, error: "Merchant di luar wilayah admin" };
  }

  if (
    parsed.data.status_verifikasi === "approved" &&
    !merchant.owner_id
  ) {
    return {
      ok: false,
      error: "Merchant tanpa pemilik tidak dapat disetujui",
    };
  }

  const patch = buildMerchantVerificationPatch(parsed.data, auth.userId);

  const { error: updateErr } = await admin
    .from("merchants")
    .update(patch)
    .eq("id", merchantId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath("/admin/dashboard/merchants");
  return { ok: true, message: "Status verifikasi merchant diperbarui" };
}

export async function verifyDriver(raw: unknown): Promise<AdminActionResult> {
  const auth = await requireAnyAdmin();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  const parsed = verifyDriverSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid" };
  }

  const admin = getSupabaseAdmin();
  const { driverId, service_city_id } = parsed.data;

  const { data: driver } = await admin
    .from("drivers")
    .select("id, province_id, city_id")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver) {
    return { ok: false, error: "Driver tidak ditemukan" };
  }

  if (!entityWithinAdminScope(auth, driver)) {
    return { ok: false, error: "Driver di luar wilayah admin" };
  }

  const { data: city } = await admin
    .from("service_cities")
    .select("id, province_id, city_id")
    .eq("id", service_city_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!city) {
    return { ok: false, error: "Kota layanan tidak valid atau tidak aktif" };
  }

  const patch = buildDriverVerificationPatch(parsed.data);

  const { error: updateErr } = await admin
    .from("drivers")
    .update(patch)
    .eq("id", driverId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath("/admin/dashboard/drivers");
  return { ok: true, message: "Data driver diperbarui" };
}
