import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminTier } from "@/app/utils/adminAuth";

export type AdminAuditInput = {
  adminId: string;
  adminRole: AdminTier;
  action: string;
  entityTable?: string;
  entityId?: string;
  provinceId?: number | null;
  cityId?: number | null;
  payload?: Record<string, unknown>;
};

/**
 * Catat jejak audit untuk mutasi sensitif (tarif, finansial, persetujuan).
 * Dipanggil setelah validasi RBAC — bukan pengganti authorization.
 */
export async function recordAdminAudit(
  admin: SupabaseClient,
  input: AdminAuditInput
): Promise<void> {
  await admin.from("admin_audit_logs").insert({
    admin_id: input.adminId,
    admin_role: input.adminRole,
    action: input.action,
    entity_table: input.entityTable ?? null,
    entity_id: input.entityId ?? null,
    province_id: input.provinceId ?? null,
    city_id: input.cityId ?? null,
    payload: input.payload ?? null,
  });
}
