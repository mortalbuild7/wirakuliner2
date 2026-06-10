"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAudit } from "@/lib/admin-audit";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { appWithdrawalSchema } from "@/lib/admin/finance-schemas";
import { getSupabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export type FinanceActionResult =
  | { ok: true; message?: string; balanceAfter?: number }
  | { ok: false; error: string };

/**
 * Catat penarikan dana aplikasi ke rekening bank (atomik via RPC).
 *
 * Alur akuntansi:
 * 1. Validasi Zod — tolak nominal negatif / field ilegal
 * 2. `requireSuperAdmin()` — hanya SUPER_ADMIN
 * 3. RPC `record_app_withdrawal` — debit `app_finance_ledger` + INSERT log OUT
 */
export async function recordAppWithdrawal(
  raw: unknown
): Promise<FinanceActionResult> {
  const auth = await requireSuperAdmin();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  const parsed = appWithdrawalSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Input tidak valid" };
  }

  const { amount, bankName, accountNumber, accountHolder, note } = parsed.data;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("record_app_withdrawal", {
    p_amount: amount,
    p_bank_name: bankName,
    p_account_number: accountNumber.replace(/\s/g, ""),
    p_account_holder: accountHolder,
    p_note: note || null,
    p_admin_id: auth.userId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const payload = (data ?? {}) as { balance_after?: number };
  await recordAdminAudit(admin, {
    adminId: auth.userId,
    adminRole: "SUPER_ADMIN",
    action: "APP_WITHDRAWAL_RECORDED",
    entityTable: "app_withdrawals",
    payload: { amount, bankName },
  });

  revalidatePath("/admin/finance");

  return {
    ok: true,
    message: "Penarikan dana berhasil dicatat",
    balanceAfter: Number(payload.balance_after ?? 0),
  };
}
