import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Customer membatalkan pesanan yang belum dibayar. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "customer-orders-cancel", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "Pesanan tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id, customer_id, order_status")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (order.customer_id !== user.id) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (order.order_status !== "pending_payment") {
    return secureJsonResponse(
      { error: "Hanya pesanan yang belum dibayar yang bisa dibatalkan" },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({ order_status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return secureJsonResponse(
      { error: updateError.message ?? "Gagal membatalkan pesanan" },
      { status: 500 }
    );
  }

  await admin
    .from("payment_transactions")
    .update({ status: "cancel" })
    .eq("order_id", id)
    .eq("status", "pending");

  return secureJsonResponse({
    ok: true,
    message: "Pesanan dibatalkan",
    orderId: id,
  });
}
