import { verifyAdminSession } from "@/app/utils/adminAuth";
import { RegionalMerchantsPanel } from "@/components/admin/regional-merchants-panel";
import {
  applyRegionalEntityScope,
  regionalScopeHint,
} from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Manajemen merchant regional — Server Component.
 * Filter province_id / city_id diterapkan di server sebelum render UI.
 */
export default async function AdminDashboardMerchantsPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let query = supabase
    .from("merchants")
    .select("*, owner:profiles!owner_id(email, name)")
    .order("created_at", { ascending: false });

  query = applyRegionalEntityScope(query, session);

  const { data: merchants } = await query;

  return (
    <RegionalMerchantsPanel
      initialMerchants={merchants ?? []}
      scopeHint={regionalScopeHint(session)}
      adminTier={session.adminRole}
    />
  );
}
