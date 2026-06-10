import { verifyAdminSession } from "@/app/utils/adminAuth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Perekrutan admin regional — hanya SUPER_ADMIN & PROVINCE_ADMIN.
 * CITY_ADMIN tidak melihat menu ini (UI masking di Sidebar).
 */
export default async function AdminRecruitPage() {
  const session = await verifyAdminSession();

  if (session.adminRole === "CITY_ADMIN") {
    redirect("/unauthorized");
  }

  return (
    <main className="p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <UserPlus className="h-7 w-7" />
        Perekrutan Admin Baru
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {session.adminRole === "SUPER_ADMIN"
          ? "Buat akun Province Admin atau City Admin di seluruh Indonesia."
          : `Rekrut City Admin untuk kota-kota di ${session.provinceName ?? "provinsi Anda"}.`}
      </p>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Alur rekrutmen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Buat akun Supabase Auth dengan email korporat.</p>
          <p>2. Set `profiles.role = admin` dan `admin_role` sesuai tier.</p>
          <p>3. Isi `province_id` / `city_id` untuk scope wilayah.</p>
          <p>4. Minta admin baru menyelesaikan MFA TOTP di login pertama.</p>
        </CardContent>
      </Card>
    </main>
  );
}
