"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activateAdminAccount } from "@/app/actions/adminActivateActions";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

export function AdminActivateForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok");
      return;
    }

    startTransition(async () => {
      const res = await activateAdminAccount(token, password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      alert(res.message);
      router.push("/admin/login");
    });
  }

  if (!token) {
    return (
      <Alert variant="destructive">
        Tautan aktivasi tidak valid — periksa email dari admin@wirakuliner.web.id
      </Alert>
    );
  }

  return (
    <Card className="max-w-md border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-slate-800">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          Aktivasi Akun Admin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-slate-600">
          Buat password permanen Anda. Setelah login,{" "}
          <strong className="text-slate-800">wajib aktifkan MFA</strong> (Google
          Authenticator) demi keamanan operasional.
        </p>

        {error && (
          <Alert variant="destructive" className="mb-4">
            {error}
          </Alert>
        )}

        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label>Password baru</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label>Konfirmasi password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending} className="gap-2">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Aktifkan Akun
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Sudah aktif?{" "}
          <Link href="/admin/login" className="text-emerald-600 hover:underline">
            Login admin
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
