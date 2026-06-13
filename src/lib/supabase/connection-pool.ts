import "server-only";

/**
 * Supabase / Postgres connection pooling untuk Next.js serverless.
 *
 * - `@supabase/supabase-js` memakai REST API (HTTPS) — tidak menghabiskan slot Postgres langsung.
 * - Koneksi direct Postgres (Prisma, raw SQL, migrasi) WAJIB memakai Supavisor port **6543**
 *   (transaction mode) agar tidak kena "Max client connections exceeded".
 *
 * Env (server-only, Vercel):
 * - SUPABASE_DB_POOLER_URL — postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
 * - DATABASE_URL — alias; jika berisi :5432 akan diarahkan ke pooler bila SUPABASE_USE_POOLER=true
 */

const POOLER_PORT = "6543";
const DIRECT_PORT = "5432";

export function resolvePooledDatabaseUrl(): string | null {
  const pooler = process.env.SUPABASE_DB_POOLER_URL?.trim();
  if (pooler) return pooler;

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) return null;

  if (process.env.SUPABASE_USE_POOLER === "false") return dbUrl;

  if (dbUrl.includes(`:${DIRECT_PORT}/`) && dbUrl.includes("pooler.supabase.com")) {
    return dbUrl.replace(`:${DIRECT_PORT}/`, `:${POOLER_PORT}/`);
  }

  if (dbUrl.includes(`:${DIRECT_PORT}/`) && process.env.SUPABASE_USE_POOLER !== "false") {
    return dbUrl
      .replace(`:${DIRECT_PORT}/`, `:${POOLER_PORT}/`)
      .concat(dbUrl.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true");
  }

  return dbUrl;
}

/** URL REST Supabase — tetap NEXT_PUBLIC_SUPABASE_URL (bukan pooler Postgres). */
export function getSupabaseRestUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diset");
  }
  return url;
}
