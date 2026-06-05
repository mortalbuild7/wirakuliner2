"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthLayout, AuthField, authInputClass, AuthSubmitButton } from "@/components/auth/auth-layout";
import { Bike } from "lucide-react";

export default function DriverSetupPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/driver/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Gagal menghubungkan akun");
        return;
      }
      window.location.assign("/driver");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      badge="WIRA Driver"
      title="Hubungkan akun driver"
      subtitle="Masukkan nomor HP yang didaftarkan admin"
      footer={
        <p className="text-center text-xs text-muted-foreground">
          Belum terdaftar? Hubungi admin WIRA Kuliner.
        </p>
      }
    >
      <form onSubmit={handleLink} className="space-y-4">
        <AuthField label="Nomor telepon" id="phone">
          <Input
            id="phone"
            type="tel"
            className={authInputClass}
            placeholder="08xxxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </AuthField>
        <AuthSubmitButton loading={loading}>
          <Bike className="mr-2 h-4 w-4" />
          Aktifkan akun driver
        </AuthSubmitButton>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Admin harus mendaftarkan Anda di panel Admin → Drivers terlebih dahulu.
      </p>
    </AuthLayout>
  );
}
