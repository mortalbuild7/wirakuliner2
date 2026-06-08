import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * PROTEKSI SERVICE ROLE KEY — Isolasi Kunci Master
 *
 * - `SUPABASE_SERVICE_ROLE_KEY` HARUS di `.env.local` / Vercel env TANPA prefix `NEXT_PUBLIC_`.
 * - File ini memakai `import "server-only"` agar bundler Next.js MEMAKSA modul ini
 *   tidak pernah masuk ke Client Component (cegah kebocoran kunci master ke browser).
 * - Hanya import dari: API Route admin, Server Actions admin, RPC background job.
 *
 * Service role BYPASS Row Level Security — gunakan hanya setelah `requireSuperAdmin()` lolos.
 */

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi (server-only, tanpa NEXT_PUBLIC_)"
    );
  }

  adminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/** Alias eksplisit — sama dengan getSupabaseAdmin(). */
export const supabaseAdmin = {
  get client() {
    return getSupabaseAdmin();
  },
};
