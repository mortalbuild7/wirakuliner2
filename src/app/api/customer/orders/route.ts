import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Daftar pesanan customer — bypass RLS setelah verifikasi sesi. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "customer-orders", RATE_LIMITS.api);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: orders, error } = await admin
    .from("orders")
    .select("*, merchants(name)")
    .eq("customer_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return secureJsonResponse({ error: error.message ?? "Gagal memuat pesanan" }, { status: 500 });
  }

  return secureJsonResponse({ orders: orders ?? [] });
}
