"use client";

/**
 * Pendaftaran MFA TOTP untuk akun SUPER_ADMIN.
 *
 * Prasyarat di Supabase Dashboard:
 * - Authentication → Multi-Factor Authentication → aktifkan TOTP
 * - Maximum enrolled factors ≥ 1
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  ShieldCheck,
  Loader2,
  KeyRound,
  QrCode,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

type EnrollState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function MfaSetupForm() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState("");
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);

  const checkExisting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: factors, error: listErr } =
        await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;

      const verified = factors?.totp?.some((f) => f.status === "verified");
      setAlreadyEnrolled(Boolean(verified));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memeriksa status MFA");
    } finally {
      setLoading(false);
    }
  }, [supabase.auth.mfa]);

  useEffect(() => {
    void checkExisting();
  }, [checkExisting]);

  async function startEnroll() {
    setEnrolling(true);
    setError(null);
    setEnroll(null);
    try {
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "WIRA Admin",
      });
      if (enrollErr || !data?.id || !data.totp) {
        throw enrollErr ?? new Error("Gagal memulai pendaftaran MFA");
      }

      setEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Gagal enroll — pastikan TOTP aktif di Supabase Dashboard"
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || code.length < 6) return;

    setSubmitting(true);
    setError(null);
    try {
      const { data: challenge, error: chErr } =
        await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr || !challenge) {
        throw chErr ?? new Error("Gagal membuat challenge MFA");
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;

      setAlreadyEnrolled(true);
      setEnroll(null);
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode OTP tidak valid");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-8">
      <Link
        href="/admin/security"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Keamanan
      </Link>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Setup MFA Admin</h1>
            <p className="text-sm text-muted-foreground">
              Daftarkan Google Authenticator / Authy untuk akun SUPER_ADMIN
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memeriksa status MFA…
          </div>
        ) : alreadyEnrolled ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="font-medium text-emerald-800">
              MFA TOTP sudah aktif untuk akun ini
            </p>
            <p className="text-sm text-muted-foreground">
              Setiap login admin akan meminta kode OTP sebelum masuk panel.
            </p>
            <Button asChild className="w-full">
              <Link href="/admin">Masuk Panel Admin</Link>
            </Button>
          </div>
        ) : !enroll ? (
          <div className="space-y-4">
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-950">
              <p className="text-sm">
                Pastikan TOTP sudah diaktifkan di{" "}
                <strong>Supabase Dashboard → Authentication → MFA</strong> sebelum
                memulai.
              </p>
            </Alert>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              className="w-full gap-2"
              onClick={() => void startEnroll()}
              disabled={enrolling}
            >
              {enrolling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              Generate QR Code
            </Button>
          </div>
        ) : (
          <form onSubmit={confirmEnroll} className="space-y-4">
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <div
                className="[&_svg]:h-44 [&_svg]:w-44"
                dangerouslySetInnerHTML={{ __html: enroll.qrCode }}
              />
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Secret manual (backup)</p>
              <p className="mt-1 font-mono text-sm break-all">{enroll.secret}</p>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="h-4 w-4" />
                Kode OTP pertama (6 digit)
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

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEnroll(null);
                  setCode("");
                  setError(null);
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={submitting || code.length < 6}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memverifikasi…
                  </>
                ) : (
                  "Aktifkan MFA"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminMfaSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MfaSetupForm />
    </Suspense>
  );
}
