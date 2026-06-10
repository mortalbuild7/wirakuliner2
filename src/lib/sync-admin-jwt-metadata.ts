import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminTier } from "@/app/utils/adminAuth";

/**
 * Sinkronkan tier regional ke JWT app_metadata Supabase.
 * RLS `get_auth_admin_metadata()` membaca claim ini via auth.jwt().
 */
export async function syncAdminJwtMetadata(
  admin: SupabaseClient,
  userId: string,
  meta: {
    adminRole: AdminTier;
    provinceId?: number | null;
    cityId?: number | null;
  }
): Promise<void> {
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      admin_role: meta.adminRole,
      province_id: meta.provinceId ?? null,
      city_id: meta.cityId ?? null,
    },
  });
}
