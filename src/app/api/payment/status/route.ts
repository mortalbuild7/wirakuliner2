import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Cek status pembayaran QRIS (polling frontend). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "payment-status", RATE_LIMITS.api);
  if (rl) return rl;

  const url = new URL(req.url);
  const midtransOrderId = url.searchParams.get("midtransOrderId")?.trim();
  const orderId = url.searchParams.get("orderId")?.trim();

  if (!midtransOrderId && !orderId) {
    return secureJsonResponse(
      { error: "midtransOrderId atau orderId wajib" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("payment_transactions")
    .select(
      "id, midtrans_order_id, payment_type, gross_amount, status, order_id, settled_at"
    )
    .eq("customer_id", user.id);

  if (midtransOrderId) {
    query = query.eq("midtrans_order_id", midtransOrderId);
  } else if (orderId && isValidUuid(orderId)) {
    query = query.eq("order_id", orderId).order("created_at", { ascending: false });
  } else {
    return secureJsonResponse({ error: "orderId tidak valid" }, { status: 400 });
  }

  const { data: pt } = await query.limit(1).maybeSingle();

  if (!pt) {
    return secureJsonResponse({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }

  let orderStatus: string | null = null;
  if (pt.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("order_status")
      .eq("id", pt.order_id)
      .maybeSingle();
    orderStatus = order?.order_status ?? null;
  }

  return secureJsonResponse({
    ok: true,
    midtransOrderId: pt.midtrans_order_id,
    paymentType: pt.payment_type,
    grossAmount: Number(pt.gross_amount),
    status: pt.status,
    paid: pt.status === "settlement" || orderStatus === "paid",
    orderId: pt.order_id,
    orderStatus,
    settledAt: pt.settled_at,
  });
}
