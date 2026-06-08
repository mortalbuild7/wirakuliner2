import { z } from "zod";

/**
 * PROTEKSI MASS ASSIGNMENT
 *
 * Skema Zod `.strict()` menolak kunci tambahan di payload (mis. `role`, `owner_id`, `balance`).
 * Hanya field yang tercantum di bawah yang lolos ke query UPDATE Supabase.
 *
 * Pemetaan nama bisnis → kolom PostgreSQL:
 * - `status_verifikasi` → `merchants.approval_status`
 * - `catatan_admin`      → `merchants.admin_note`
 */

export const verifyMerchantSchema = z
  .object({
    merchantId: z.string().uuid("ID merchant harus UUID valid"),
    /** Status verifikasi pendaftaran merchant */
    status_verifikasi: z.enum(["pending", "approved", "rejected"]),
    /** Catatan internal admin — tidak ditampilkan ke merchant */
    catatan_admin: z
      .string()
      .trim()
      .max(500, "Catatan admin maksimal 500 karakter")
      .optional(),
  })
  .strict();

export type VerifyMerchantInput = z.infer<typeof verifyMerchantSchema>;

/** Whitelist kolom UPDATE — tidak ada field lain yang boleh masuk ke DB. */
export function buildMerchantVerificationPatch(
  input: VerifyMerchantInput,
  adminUserId: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    approval_status: input.status_verifikasi,
    admin_note: input.catatan_admin ?? null,
    approved_by: adminUserId,
  };

  if (input.status_verifikasi === "approved") {
    base.approved_at = new Date().toISOString();
    base.rejection_note = null;
    base.admin_suspended = false;
    base.is_active = true;
  } else if (input.status_verifikasi === "rejected") {
    base.approved_at = null;
    base.rejection_note = input.catatan_admin ?? "Pendaftaran ditolak admin";
    base.is_active = false;
    base.is_open = false;
  } else {
    base.approved_at = null;
    base.rejection_note = null;
  }

  return base;
}

export const verifyDriverSchema = z
  .object({
    driverId: z.string().uuid("ID driver harus UUID valid"),
    /** Kota layanan yang diizinkan untuk driver */
    service_city_id: z.string().uuid("Kota layanan harus UUID valid"),
    catatan_admin: z.string().trim().max(500).optional(),
  })
  .strict();

export type VerifyDriverInput = z.infer<typeof verifyDriverSchema>;

/** Hanya `service_city_id` yang di-update di tabel drivers. */
export function buildDriverVerificationPatch(
  input: VerifyDriverInput
): Record<string, unknown> {
  return { service_city_id: input.service_city_id };
}
