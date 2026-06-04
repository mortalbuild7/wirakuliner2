"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import {
  AuthLayout,
  AuthField,
  authInputClass,
  AuthSubmitButton,
} from "@/components/auth/auth-layout";
import type { UserRole } from "@/types/database";
import { LogIn, Store, Shield, UtensilsCrossed } from "lucide-react";

const ROLE_REDIRECT: Record<UserRole, string> = {
  admin: "/admin",
  merchant: "/merchant",
  customer: "/customer",
  driver: "/customer",
};

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "";
  const supabase = createClient();

  const redirectHint =
    redirect.startsWith("/merchant")
      ? { icon: Store, text: "Masuk untuk kelola toko / setup merchant" }
      : redirect.startsWith("/admin")
        ? { icon: Shield, text: "Masuk ke Panel Admin" }
        : redirect.startsWith("/customer")
          ? { icon: UtensilsCrossed, text: "Masuk untuk pesan makanan" }
          : null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    const metaRole = data.user!.user_metadata?.role as UserRole | undefined;
    let { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user!.id)
      .single();

    if (!profile) {
      const role = metaRole ?? "customer";
      if (role !== "admin") {
        await fetch("/api/auth/assign-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role }),
        });
      }
      profile = { role };
    }

    const role = (profile.role ?? "customer") as UserRole;
    const wanted = redirect;
    let target = wanted || ROLE_REDIRECT[role];
    if (wanted.startsWith("/admin") && role !== "admin") {
      target = "/?error=unauthorized&need=admin";
    } else if (wanted.startsWith("/merchant") && role !== "merchant") {
      target = "/?error=unauthorized&need=merchant";
    } else if (role === "merchant") {
      const { data: shop } = await supabase
        .from("merchants")
        .select("id")
        .eq("owner_id", data.user!.id)
        .maybeSingle();
      target = shop ? "/merchant" : "/merchant/setup";
    }

    router.push(target);
    router.refresh();
  }

  const registerHref =
    redirect.startsWith("/merchant")
      ? "/register?role=merchant"
      : "/register?role=customer";

  const HintIcon = redirectHint?.icon;

  return (
    <AuthLayout
      badge="Akun WIRA"
      title="Masuk"
      subtitle="Satu akun untuk customer, merchant, atau admin"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href={registerHref} className="font-medium text-cyan-400 underline-offset-4 hover:underline">
            Daftar sekarang
          </Link>
        </p>
      }
    >
      {redirectHint && HintIcon && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-xs text-cyan-200">
          <HintIcon className="h-4 w-4 shrink-0" />
          {redirectHint.text}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <AuthField label="Email" id="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className={authInputClass}
            placeholder="nama@email.com"
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
          Masuk
        </AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="wira-mesh flex min-h-[100dvh] items-center justify-center text-cyan-300/80">
          Memuat...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
