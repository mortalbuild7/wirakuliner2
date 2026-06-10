import Link from "next/link";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/** Antrean verifikasi berkas driver — CITY_ADMIN prioritas (badge di sidebar). */
export default async function DriverVerificationPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let query = supabase
    .from("drivers")
    .select("id, name, phone, vehicle_plate, photo_url, created_at, city_id")
    .or("photo_url.is.null,vehicle_plate.is.null")
    .order("created_at", { ascending: false })
    .limit(50);

  if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    query = query.eq("city_id", session.cityId);
  } else if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    query = query.eq("province_id", session.provinceId);
  }

  const { data: queue } = await query;

  return (
    <main className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileCheck className="h-7 w-7 text-emerald-500" />
            Verifikasi Berkas Driver
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.adminRole === "CITY_ADMIN"
              ? "Tugas utama City Admin — lengkapi foto & plat kendaraan."
              : "Pantau antrean verifikasi di wilayah Anda."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/drivers">Kelola Driver</Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {(queue ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Tidak ada berkas menunggu verifikasi.
            </CardContent>
          </Card>
        ) : (
          (queue ?? []).map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{d.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>HP: {d.phone}</p>
                <p>Plat: {d.vehicle_plate ?? "— belum diisi"}</p>
                <p>Foto: {d.photo_url ? "Sudah ada" : "Belum upload"}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
