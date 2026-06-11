"use server";

import { hashActivationToken } from "@/lib/email/admin-activation-token";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivateAdminResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Verifikasi token aktivasi + set password permanen admin.
 * Token sekali pakai, kedaluwarsa 24 jam — mitigasi brute-force dengan lookup hash tunggal.
 */
export async function activateAdminAccount(
  rawToken: string,
  newPassword: string
): Promise<ActivateAdminResult> {
  const token = rawToken.trim();
  if (!token || token.length < 32) {
    return { ok: false, error: "Token aktivasi tidak valid" };
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    return { ok: false, error: "Password minimal 8 karakter" };
  }

  const tokenHash = hashActivationToken(token);
  const admin = createAdminClient();

  const { data: row, error: lookupErr } = await admin
    .from("admin_activation_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!row) return { ok: false, error: "Token tidak ditemukan atau sudah digunakan" };
  if (row.used_at) return { ok: false, error: "Token sudah digunakan" };

  const expires = new Date(row.expires_at);
  if (expires.getTime() < Date.now()) {
    return { ok: false, error: "Token aktivasi sudah kedaluwarsa — minta SUPER_ADMIN mengirim ulang" };
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(row.user_id, {
    password: newPassword,
    email_confirm: true,
  });

  if (pwErr) return { ok: false, error: pwErr.message };

  const { error: markErr } = await admin
    .from("admin_activation_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  if (markErr) return { ok: false, error: markErr.message };

  return {
    ok: true,
    message:
      "Akun berhasil diaktifkan. Silakan login dan segera aktifkan MFA (Google Authenticator).",
  };
}
