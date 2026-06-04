"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
  AuthLayout,
  AuthField,
  authInputClass,
  AuthSubmitButton,
  RoleTabs,
} from "@/components/auth/auth-layout";
import type { UserRole } from "@/types/database";
import { UserPlus } from "lucide-react";

const ROLE_REDIRECT: Record<UserRole, string> = {
  admin: "/admin",
  merchant: "/merchant/setup",
  customer: "/customer",
  driver: "/customer",
};

const ROLE_COPY = {
  customer: {
    badge: "Pemesan",
    subtitle: "Pesan makanan dari toko dalam radius 3 km",
  },
  merchant: {
    badge: "Toko",
    subtitle: "Daftar toko, kelola menu & terima pesanan realtime",
  },
};

function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const roleParam = params.get("role");
  const role: UserRole = roleParam === "merchant" ? "merchant" : "customer";
  const copy = ROLE_COPY[role];
  const supabase = createClient();

  useEffect(() => {
    if (roleParam === "admin") {
      router.replace("/register?role=customer");
    }
  }, [roleParam, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      alert("Cek email untuk konfirmasi, atau nonaktifkan confirm email di Supabase.");
      setLoading(false);
      return;
    }

    const assignRes = await fetch("/api/auth/assign-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role }),
    });

    if (!assignRes.ok) {
      const body = (await assignRes.json().catch(() => ({}))) as { error?: string };
      alert(
        body.error ??
          "Gagal menyimpan peran. Pastikan SUPABASE_SERVICE_ROLE_KEY di .env.local lalu restart server."
      );
      setLoading(false);
      return;
    }

    await supabase.auth.getSession();
    setLoading(false);
    router.push(ROLE_REDIRECT[role]);
    router.refresh();
  }

  const loginHref =
    role === "merchant" ? "/login?redirect=/merchant/setup" : "/login?redirect=/customer";

  return (
    <AuthLayout
      badge={copy.badge}
      title="Daftar"
      subtitle={copy.subtitle}
      footer={
        <>
          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link href={loginHref} className="font-medium text-cyan-400 underline-offset-4 hover:underline">
              Masuk
            </Link>
          </p>
          <p className="mt-3 text-center text-[11px] text-muted-foreground/80">
            Panel admin tidak bisa didaftarkan sendiri — hubungi operator platform.
          </p>
        </>
      }
    >
      <RoleTabs active={role} />

      <form onSubmit={handleRegister} className="space-y-4">
        <AuthField label="Nama" id="name">
          <Input
            id="name"
            autoComplete="name"
            className={authInputClass}
            placeholder="Nama lengkap"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </AuthField>
        <AuthField label="Email" id="reg-email">
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            className={authInputClass}
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>
        <AuthField label="Password" id="reg-password">
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            className={authInputClass}
            placeholder="Min. 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </AuthField>
        <AuthSubmitButton loading={loading}>
          <UserPlus className="mr-2 h-4 w-4" />
          Daftar sebagai {role === "merchant" ? "Merchant" : "Customer"}
        </AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="wira-mesh flex min-h-[100dvh] items-center justify-center text-cyan-300/80">
          Memuat...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
