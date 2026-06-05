import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/** Konfirmasi bayar (uji bypass / setelah nego) — status paid + notify driver. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-confirm-payment", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    orderId?: string;
    deliveryFee?: number;
    driverId?: string | null;
    negotiationId?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, order_status")
    .eq("id", orderId)
    .single();

  if (!order || order.customer_id !== user.id) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (parsed.data.negotiationId && isValidUuid(parsed.data.negotiationId)) {
    await admin
      .from("negotiations")
      .update({ status: "accepted" })
      .eq("id", parsed.data.negotiationId);
  }

  const { error: payError } = await admin
    .from("orders")
    .update({
      order_status: "paid",
      delivery_fee: parsed.data.deliveryFee ?? undefined,
      negotiation_status: "agreed",
      driver_id: parsed.data.driverId ?? undefined,
      snap_token: `BYPASS_${orderId}`,
    })
    .eq("id", orderId);

  if (payError) {
    return secureJsonResponse(
      { error: payError.message ?? "Gagal mengonfirmasi pembayaran" },
      { status: 500 }
    );
  }

  await notifyDriversNewOrder(orderId);

  return secureJsonResponse({ ok: true, orderId, paid: true });
}
