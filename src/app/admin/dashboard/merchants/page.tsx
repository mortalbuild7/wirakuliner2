import { verifyAdminSession } from "@/app/utils/adminAuth";
import { DashboardMerchantsTable } from "@/components/admin/dashboard-merchants-table";
import {
  applyRegionalEntityScope,
  regionalScopeHint,
} from "@/lib/admin/regional-scope";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * URL: /admin/dashboard/merchants
 * File: app/admin/dashboard/merchants/page.tsx
 *
 * Filter geografis otomatis per tier admin (city_id / province_id).
 */
export default async function AdminMerchantsDashboardPage() {
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
