import {
  regionalDashboardTitle,
  verifyAdminSession,
} from "@/app/utils/adminAuth";
import { RegionalTariffForm } from "@/components/admin/regional-tariff-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminTariffsPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let query = supabase
    .from("regional_tariffs")
    .select("id, province_id, city_id, base_fare, price_per_km, merchant_markup")
    .order("province_id")
    .order("city_id", { ascending: true, nullsFirst: true });

  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    query = query.eq("province_id", session.provinceId);
  } else if (session.adminRole === "CITY_ADMIN" && session.cityId != null) {
    query = query.eq("city_id", session.cityId);
  }

  const { data: tariffs, error } = await query;

  const canEdit = session.adminRole !== "CITY_ADMIN";

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Tarif Regional</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {regionalDashboardTitle(session)} — pengaturan ongkir & markup wilayah
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-600">{error.message}</p>
      )}

      <div className="mt-6">
        <RegionalTariffForm
          tariffs={(tariffs ?? []) as {
            id: string;
            province_id: number;
            city_id: number | null;
            base_fare: number;
            price_per_km: number;
            merchant_markup: number;
          }[]}
          lockedProvinceId={
            session.adminRole === "PROVINCE_ADMIN" ? session.provinceId : null
          }
          canEdit={canEdit}
        />
      </div>
    </main>
  );
}
