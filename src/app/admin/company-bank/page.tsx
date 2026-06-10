import { verifyAdminSession } from "@/app/utils/adminAuth";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

/** Data rekening perusahaan — SUPER_ADMIN only (sidebar + guard halaman). */
export default async function CompanyBankPage() {
  await verifyAdminSession({ requireSuperAdmin: true });

  return (
    <main className="p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Landmark className="h-7 w-7 text-amber-500" />
        Data Rekening Perusahaan
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Informasi rekening penampung dan penarikan dana aplikasi — akses mutlak Super Admin.
      </p>

      <Card className="mt-6 max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Rekening operasional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Kelola penarikan dan arus kas lengkap di modul Keuangan.
          </p>
          <Button asChild>
            <Link href="/admin/finance">Buka Panel Keuangan</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
