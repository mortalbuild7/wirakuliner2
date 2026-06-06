"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Clock, XCircle } from "lucide-react";

type ShopStatus = {
  name: string;
  approval_status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
};

export default function MerchantPendingPage() {
  const [shop, setShop] = useState<ShopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login?redirect=/merchant/pending");
        return;
      }

      const { data } = await supabase
        .from("merchants")
        .select("name, approval_status, rejection_note")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!data) {
        router.replace("/merchant/setup");
        return;
      }

      if (data.approval_status === "approved") {
        router.replace("/merchant");
        return;
      }

      setShop(data as ShopStatus);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (loading) {
    return <main className="p-6">Memuat...</main>;
  }

  if (!shop) return null;

  const rejected = shop.approval_status === "rejected";

  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {rejected ? (
              <XCircle className="h-6 w-6 text-red-500" />
            ) : (
              <Clock className="h-6 w-6 text-amber-500" />
            )}
            {rejected ? "Pendaftaran Ditolak" : "Menunggu Persetujuan Admin"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Toko <strong>{shop.name}</strong>{" "}
            {rejected
              ? "belum disetujui oleh admin WIRA Kuliner."
              : "sudah terdaftar dan sedang ditinjau oleh admin WIRA Kuliner."}
          </p>

          {rejected ? (
            <Alert variant="destructive">
              {shop.rejection_note ?? "Pendaftaran ditolak. Hubungi admin untuk informasi lebih lanjut."}
            </Alert>
          ) : (
            <Alert variant="warning">
              Anda belum bisa mengelola menu atau menerima pesanan sampai admin menyetujui toko Anda.
              Biasanya proses ini memakan waktu 1×24 jam kerja.
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Cek status lagi
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/">Ke beranda</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
