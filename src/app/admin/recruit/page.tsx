import { verifyAdminSession } from "@/app/utils/adminAuth";
import { INDONESIA_PROVINCES } from "@/app/utils/indonesiaProvinces";
import { AdminRecruitForm } from "@/components/admin/admin-recruit-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { Mail, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Perekrutan admin regional — SUPER_ADMIN & PROVINCE_ADMIN.
 * Setelah akun dibuat, email aktivasi otomatis dikirim via Zoho SMTP.
 */
export default async function AdminRecruitPage() {
  const session = await verifyAdminSession();

  if (session.adminRole === "CITY_ADMIN") {
    redirect("/unauthorized");
  }

  let provinces = [...INDONESIA_PROVINCES];
  let defaultProvinceId = provinces[0]?.id ?? 1;
  const provinceLocked = session.adminRole === "PROVINCE_ADMIN";

  if (provinceLocked && session.provinceId != null) {
    provinces = provinces.filter((p) => p.id === session.provinceId);
    defaultProvinceId = session.provinceId;
  }

  return (
    <main className="p-6 text-slate-800">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <UserPlus className="h-7 w-7 text-emerald-600" />
        Perekrutan Admin Baru
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {session.adminRole === "SUPER_ADMIN"
          ? "Buat akun Province Admin atau City Admin — email aktivasi terkirim otomatis."
          : `Rekrut City Admin untuk kota di ${session.provinceName ?? "provinsi Anda"}.`}
      </p>

      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-800">
            <Mail className="h-4 w-4 text-emerald-600" />
            Alur keamanan otomatis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>1. Akun Supabase Auth dibuat (email belum dikonfirmasi).</p>
          <p>2. Token aktivasi 24 jam dihasilkan via modul crypto Node.js.</p>
          <p>
            3. Email instruksi dikirim dari{" "}
            <strong className="text-slate-800">admin@wirakuliner.web.id</strong>{" "}
            (Zoho, SPF/DKIM/DMARC).
          </p>
          <p>4. Admin baru wajib MFA TOTP (Google Authenticator) saat login pertama.</p>
        </CardContent>
      </Card>

      <AdminRecruitForm
        recruiterTier={session.adminRole}
        provinces={provinces}
        defaultProvinceId={defaultProvinceId}
        provinceLocked={provinceLocked}
      />
    </main>
  );
}
