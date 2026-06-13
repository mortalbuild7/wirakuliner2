import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRestUrl } from "@/lib/supabase/connection-pool";

let adminClient: SupabaseClient | undefined;

/**
 * Server-only — service role (jangan import di Client Component).
 * Singleton per runtime — kurangi overhead inisialisasi di serverless burst.
 */
export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = getSupabaseRestUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset di .env.local");
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { "x-client-info": "wira-kuliner-admin" },
    },
  });

  return adminClient;
}
