import { verifyAdminSession } from "@/app/utils/adminAuth";
import { DashboardMerchantsTable } from "@/components/admin/dashboard-merchants-table";
import {
  applyRegionalEntityScope,
  regionalScopeHint,
} from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** URL: /admin/merchants */
export default async function AdminMerchantsPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let query = supabase
    .from("merchants")
    .select("*, owner:profiles!owner_id(email, name)")
    .order("created_at", { ascending: false });

  query = applyRegionalEntityScope(query, session);

  const { data: merchants } = await query;

  return (
    <DashboardMerchantsTable
      initialMerchants={merchants ?? []}
      scopeHint={regionalScopeHint(session)}
      adminTier={session.adminRole}
    />
  );
}
