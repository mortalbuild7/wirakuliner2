import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { isOrderCancellable, orderTotalAmount } from "@/lib/admin-order-ops";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, sanitizeText } from "@/lib/security/validate";

/** Admin batalkan order + catat pengembalian dana penuh. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-order-cancel", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ reason?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const reason = sanitizeText(parsed.data.reason, 500);
  if (!reason) {
    return secureJsonResponse({ error: "Alasan pembatalan wajib diisi" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_status, payment_gateway, total_product_amount, delivery_fee, driver_id"
    )
    .eq("id", id)
    .single();

  if (!order) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (!isOrderCancellable(order.order_status)) {
    return secureJsonResponse(
      { error: `Pesanan tidak bisa dibatalkan (status: ${order.order_status})` },
      { status: 400 }
    );
  }

  const refundAmount = orderTotalAmount(order);
  const paidStatuses = ["paid", "preparing", "ready_for_pickup", "on_the_way"];
  const needsRefund = paidStatuses.includes(order.order_status);

  const refundStatus = needsRefund
    ? order.payment_gateway === "midtrans"
      ? "pending_midtrans"
      : "full_refund"
    : "none";

  const { data: updated, error } = await admin
    .from("orders")
    .update({
      order_status: "cancelled",
      admin_cancel_reason: reason,
      admin_cancelled_at: new Date().toISOString(),
      admin_cancelled_by: auth.userId,
      refund_status: refundStatus,
      refund_amount: needsRefund ? refundAmount : 0,
      ...(needsRefund ? { snap_token: `REFUND_FULL_${id}` } : {}),
      driver_id: null,
    })
    .eq("id", id)
    .select("*, merchants(name)")
    .single();

  if (error || !updated) {
    return secureJsonResponse(
      { error: error?.message ?? "Gagal membatalkan pesanan" },
      { status: 500 }
    );
  }

  if (order.driver_id) {
    const { data: driver } = await admin
      .from("drivers")
      .select("id, status")
      .eq("id", order.driver_id)
      .single();
    if (driver?.status === "delivering") {
      await admin.from("drivers").update({ status: "idle" }).eq("id", driver.id);
    }
  }

  return secureJsonResponse({
    ok: true,
    order: updated,
    refundAmount: needsRefund ? refundAmount : 0,
    refundStatus,
    message:
      refundStatus === "pending_midtrans"
        ? "Pesanan dibatalkan. Refund Midtrans perlu diproses manual di dashboard Midtrans."
        : needsRefund
          ? "Pesanan dibatalkan dengan pengembalian dana penuh (mode uji / non-Midtrans)."
          : "Pesanan dibatalkan.",
  });
}
