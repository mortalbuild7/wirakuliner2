import { redirect } from "next/navigation";

/**
 * Alias MFA challenge — mengarahkan ke halaman verifikasi TOTP existing.
 * Memenuhi spesifikasi `/admin/mfa-challenge` (Google Authenticator / OTP).
 */
export default async function AdminMfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const target = params.redirect ?? "/admin";
  redirect(`/admin/mfa-verify?redirect=${encodeURIComponent(target)}`);
}
