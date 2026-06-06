"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { JALAN_WIRA } from "@/lib/geo-config";

/** Hanya untuk akun dengan role merchant — lengkapi data toko pertama kali */
export default function MerchantSetupPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("makanan");
  const [lat, setLat] = useState(String(JALAN_WIRA.latitude));
  const [lng, setLng] = useState(String(JALAN_WIRA.longitude));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [networkHint, setNetworkHint] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          setNetworkHint(sessionError.message);
        }

        let user = sessionData.session?.user ?? null;

        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError?.message?.includes("fetch")) {
            setNetworkHint(
              "Koneksi ke Supabase gagal. Cek internet / firewall, atau login ulang."
            );
            setLoading(false);
            return;
          }
          user = userData.user;
        }

        if (!user) {
          router.replace("/login?redirect=/merchant/setup");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError) {
          setNetworkHint(profileError.message);
          setLoading(false);
          return;
        }

        if (profile?.role !== "merchant") {
          setDenied(
            "Akun ini bukan merchant. Daftar sebagai toko di halaman pendaftaran merchant."
          );
          setLoading(false);
          return;
        }

        const { data: existing } = await supabase
          .from("merchants")
          .select("id, approval_status")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (existing) {
          router.replace(
            existing.approval_status === "approved" ? "/merchant" : "/merchant/pending"
          );
          return;
        }
        setLoading(false);
      } catch {
        setNetworkHint("Gagal memuat sesi. Coba login ulang.");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNetworkHint(null);

    try {
      const res = await fetch("/api/merchant/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          address,
          description,
          category,
          latitude: Number(lat),
          longitude: Number(lng),
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login?redirect=/merchant/setup");
          return;
        }
        alert(data.error ?? "Gagal menyimpan toko");
        setSaving(false);
        return;
      }

      router.replace("/merchant/pending");
      router.refresh();
    } catch {
      alert(
        "Koneksi gagal. Pastikan dev server jalan dan Anda sudah login. Coba login ulang di /login?redirect=/merchant/setup"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="p-6">Memuat...</main>;
  }

  if (networkHint && !denied) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Alert variant="warning">{networkHint}</Alert>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/login?redirect=/merchant/setup">Login ulang</Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Muat ulang
          </Button>
        </div>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Alert variant="warning">{denied}</Alert>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/register?role=merchant">Daftar Merchant</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Beranda</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>Pendaftaran Toko (Merchant)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Akun Anda sudah berperan <strong>merchant</strong>. Lengkapi data toko untuk mulai
            menerima pesanan.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nama toko</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Alamat</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Kategori</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="makanan">Makanan</option>
                <option value="minuman">Minuman</option>
                <option value="snack">Snack</option>
                <option value="umum">Umum</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Latitude</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Setelah submit, toko Anda akan ditinjau admin sebelum bisa menerima pesanan.
            </p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Mengirim..." : "Kirim Pendaftaran Toko"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
