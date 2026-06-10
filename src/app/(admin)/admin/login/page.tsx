"use client";

/**
 * SATU PINTU LOGIN ADMIN — `/admin/login`
 *
 * Alur otentikasi terpusat (3 tier: SUPER / PROVINCE / CITY):
 * 1. Form ini HANYA memanggil `POST /api/admin/auth/login` (bukan supabase client langsung).
 * 2. API memverifikasi `profiles.role === 'admin'` + `admin_role` tier valid.
 * 3. Rate limit Edge (middleware) + Upstash (API) mencegah brute force.
 * 4. Setelah sukses → redirect `/admin`; middleware cek MFA TOTP (aal2).
 * 5. Jika MFA belum selesai → `/admin/mfa-challenge` sebelum data sensitif.
 *
 * Customer/Driver yang mengetik URL admin manual ditangkap middleware → `/unauthorized`.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  AuthLayout,
  AuthField,
  authInputClass,
  AuthSubmitButton,
} from "@/components/auth/auth-layout";
import { LogIn, Shield } from "lucide-react";

function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/admin";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };

      if (!res.ok) {
        setError(json.error ?? "Login admin gagal");
        return;
      }

      const target = json.redirect ?? redirect;
      window.location.assign(
        target.startsWith("/admin") ? target : "/admin"
      );
    } catch {
      setError("Koneksi gagal. Periksa jaringan Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      badge="Panel Admin"
      title="Login Admin WIRA"
      subtitle="Super Admin · Province Admin · City Admin"
      footer={
        <p className="text-center text-xs text-muted-foreground">
          Bukan admin?{" "}
          <Link href="/login" className="text-cyan-400 underline-offset-4 hover:underline">
            Login customer / merchant
          </Link>
        </p>
      }
    >
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
        <Shield className="h-4 w-4 shrink-0" />
        Akses terbatas — akun harus memiliki tier admin regional yang valid.
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <AuthField label="Email Admin" id="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className={authInputClass}
            placeholder="admin@wira.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>
        <AuthField label="Password" id="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className={authInputClass}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </AuthField>
        <AuthSubmitButton loading={loading}>
          <LogIn className="mr-2 h-4 w-4" />
          Masuk Panel Admin
        </AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="wira-mesh flex min-h-[100dvh] items-center justify-center text-cyan-300/80">
          Memuat...
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
