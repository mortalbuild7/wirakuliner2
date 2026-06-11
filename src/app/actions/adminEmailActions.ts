"use server";

import { render } from "@react-email/render";
import { AdminWelcomeEmail } from "@/components/emails/AdminWelcomeEmail";
import {
  generateAdminActivationToken,
} from "@/lib/email/admin-activation-token";
import { getZohoSmtpPool, WIRA_SECURITY_FROM } from "@/lib/email/zoho-smtp-pool";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendAdminActivationResult =
  | { ok: true; expiresAt: string }
  | { ok: false; error: string };

function appBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL belum dikonfigurasi");
  return url.replace(/\/$/, "");
}

/** Simpan hash token — invalidasi token aktif lama per user (anti-reuse). */
async function persistAdminActivationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  await admin
    .from("admin_activation_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const { error } = await admin.from("admin_activation_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type SendAdminActivationInput = {
  userId: string;
  recipientEmail: string;
  adminName: string;
  tierLabel: string;
  scopeLabel: string;
};

/**
 * Kirim email aktivasi admin via Zoho SMTP port 465 (SSL/TLS, connection pooling).
 * Pengirim resmi: admin@wirakuliner.web.id — selaras SPF/DKIM/DMARC domain.
 */
export async function sendAdminActivationEmail(
  input: SendAdminActivationInput
): Promise<SendAdminActivationResult> {
  const email = input.recipientEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Alamat email penerima tidak valid" };
  }

  const { rawToken, tokenHash, expiresAt } = generateAdminActivationToken();

  const stored = await persistAdminActivationToken(
    input.userId,
    tokenHash,
    expiresAt
  );
  if (!stored.ok) return { ok: false, error: stored.error };

  const activationUrl = `${appBaseUrl()}/admin/activate?token=${encodeURIComponent(rawToken)}`;

  const html = await render(
    AdminWelcomeEmail({
      adminName: input.adminName,
      activationUrl,
      tierLabel: input.tierLabel,
      scopeLabel: input.scopeLabel,
      expiresHours: 24,
    })
  );

  try {
    const transport = getZohoSmtpPool();
    await transport.sendMail({
      from: WIRA_SECURITY_FROM,
      to: email,
      subject: "Aktivasi Akun Admin WIRA Kuliner — Wajib MFA",
      html,
      text: [
        `Selamat datang, ${input.adminName}.`,
        `Tier: ${input.tierLabel} · Wilayah: ${input.scopeLabel}`,
        `Aktivasi (24 jam): ${activationUrl}`,
        "Wajib aktifkan Google Authenticator (MFA) saat login pertama.",
      ].join("\n\n"),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengirim email";
    return { ok: false, error: msg };
  }

  return { ok: true, expiresAt: expiresAt.toISOString() };
}
