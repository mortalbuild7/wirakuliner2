"use client";

/**
 * MITIGASI BRUTE FORCE & MFA — Halaman verifikasi step-up
 *
 * ═══════════════════════════════════════════════════════════════════
 * CARA MENGAKTIFKAN MFA SUPABASE UNTUK AKUN ADMIN (TOTP / Authenticator)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. Supabase Dashboard → Authentication → Providers → pastikan Email aktif.
 *
 * 2. Dashboard → Authentication → Multi-Factor Authentication:
 *    - Aktifkan "TOTP (Authenticator App)"
 *    - Set "Maximum enrolled factors" ≥ 1 untuk akun admin
 *
 * 3. Untuk akun admin pertama kali (enroll dari client setelah login):
 *    ```ts
 *    const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
 *    // Tampilkan data.totp.qr_code ke admin, lalu:
 *    await supabase.auth.mfa.challengeAndVerify({
 *      factorId: data.id,
 *      code: '123456', // dari Google Authenticator / Authy
 *    });
 *    ```
 *
 * 4. Setelah enroll, setiap akses /admin/* membutuhkan Assurance Level 2 (aal2).
 *    Middleware memeriksa `mfa.getAuthenticatorAssuranceLevel()` dan
 *    mengarahkan ke halaman ini jika `currentLevel !== 'aal2'`.
 *
 * 5. (Opsional) Wajibkan MFA di level proyek via Supabase Auth Hooks / RLS
 *    pada tabel sensitif — defense in depth di luar middleware.
 *
 * Referensi: https://supabase.com/docs/guides/auth/auth-mfa
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Loader2, KeyRound } from "lucide-react";

function MfaVerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/admin";
  const supabase = createClient();

  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: factors, error: listErr } =
        await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;

      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (!totp) {
        setError(
          "Akun admin belum mendaftarkan MFA. Hubungi tim infrastruktur untuk enroll TOTP."
        );
        return;
      }

      const { data: challenge, error: chErr } =
        await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (chErr || !challenge) throw chErr ?? new Error("Gagal membuat challenge");

      setFactorId(totp.id);
      setChallengeId(challenge.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat MFA");
    } finally {
      setLoading(false);
    }
  }, [supabase.auth.mfa]);

  useEffect(() => {
    void initChallenge();
  }, [initChallenge]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId || code.length < 6) return;

    setSubmitting(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;

      router.replace(redirect.startsWith("/admin") ? redirect : "/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode OTP tidak valid");
      await initChallenge();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Verifikasi MFA Admin</h1>
            <p className="text-sm text-muted-foreground">
              Masukkan kode dari aplikasi Authenticator
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat tantangan MFA…
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="h-4 w-4" />
                Kode OTP (6 digit)
              </label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-lg tracking-widest"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || code.length < 6}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memverifikasi…
                </>
              ) : (
                "Lanjut ke Panel Admin"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminMfaVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MfaVerifyForm />
    </Suspense>
  );
}
