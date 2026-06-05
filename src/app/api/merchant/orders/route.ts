import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const ACTIVE_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "on_the_way",
] as const;

/** Daftar pesanan masuk merchant — bypass RLS setelah verifikasi owner. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-orders", RATE_LIMITS.api);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, name, admin_suspended")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (!merchant) {
    return secureJsonResponse({ error: "Toko belum terhubung" }, { status: 404 });
  }

  if (merchant.admin_suspended) {
    return secureJsonResponse({ error: "Toko ditangguhkan admin" }, { status: 403 });
  }

  const { data: orders, error } = await admin
    .from("orders")
    .select("*, order_items(*), profiles:customer_id(name, phone)")
    .eq("merchant_id", merchant.id)
    .in("order_status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    return secureJsonResponse({ error: error.message ?? "Gagal memuat pesanan" }, { status: 500 });
  }

  return secureJsonResponse({
    merchantId: merchant.id,
    merchantName: merchant.name,
    orders: orders ?? [],
  });
}
