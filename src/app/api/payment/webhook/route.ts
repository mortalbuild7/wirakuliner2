import { notifyDriversNewOrder } from "@/lib/notify-drivers";
import {
  isMidtransSettlement,
  type MidtransNotification,
  verifyMidtransSignature,
} from "@/lib/midtrans";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";

type SettlementResult = {
  ok?: boolean;
  already_settled?: boolean;
  payment_type?: string;
  order_id?: string;
  notify_drivers?: boolean;
  error?: string;
};

/**
 * ALUR PAYMENT GATEWAY — Anti Fake Webhook Midtrans
 *
 * Keamanan:
 * 1. Hanya terima POST dengan payload lengkap dari Midtrans.
 * 2. Verifikasi `signature_key` via SHA-512:
 *    hash(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
 *    (implementasi: `verifyMidtransSignature` di lib/midtrans.ts)
 * 3. Jika signature tidak cocok → 403 (webhook palsu ditolak).
 * 4. Settlement diproses atomik via RPC `process_midtrans_settlement` + supabaseAdmin
 *    (service role) — update order paid & bagi hasil wallet driver/merchant.
 *
 * JANGAN percaya transaction_status tanpa verifikasi signature terlebih dahulu.
 */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;

  const parsed = await readJsonBody<MidtransNotification>(req);
  if ("error" in parsed) return parsed.error;

  const payload = parsed.data;
  if (
    !payload.order_id ||
    !payload.transaction_status ||
    !payload.status_code ||
    !payload.gross_amount ||
    !payload.signature_key
  ) {
    return secureJsonResponse({ error: "Payload tidak lengkap" }, { status: 400 });
  }

  if (!verifyMidtransSignature(payload)) {
    console.warn("[midtrans-webhook] signature mismatch order_id=", payload.order_id);
    return secureJsonResponse({ error: "Signature tidak valid" }, { status: 403 });
  }

  const admin = createAdminClient();
  const grossAmount = Number(payload.gross_amount);

  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return secureJsonResponse({ error: "gross_amount tidak valid" }, { status: 400 });
  }

  if (!isMidtransSettlement(payload.transaction_status)) {
    const terminalStatus =
      payload.transaction_status === "expire"
        ? "expire"
        : payload.transaction_status === "cancel"
          ? "cancel"
          : payload.transaction_status === "deny"
            ? "deny"
            : null;

    if (terminalStatus) {
      await admin
        .from("payment_transactions")
        .update({ status: terminalStatus })
        .eq("midtrans_order_id", payload.order_id)
        .eq("status", "pending");
    }

    return secureJsonResponse({
      ok: true,
      message: `Status ${payload.transaction_status} dicatat`,
    });
  }

  const { data: result, error: rpcError } = await admin.rpc(
    "process_midtrans_settlement",
    {
      p_midtrans_order_id: payload.order_id,
      p_gross_amount: grossAmount,
    }
  );

  if (rpcError) {
    console.error("[midtrans-webhook]", rpcError.message);
    return secureJsonResponse({ error: rpcError.message }, { status: 500 });
  }

  const settled = (result ?? {}) as SettlementResult;

  if (settled.notify_drivers && settled.order_id) {
    try {
      await notifyDriversNewOrder(settled.order_id);
    } catch (e) {
      console.error("[midtrans-webhook] notify drivers:", e);
    }
  }

  return secureJsonResponse({
    ok: true,
    settled: Boolean(settled.ok),
    alreadySettled: Boolean(settled.already_settled),
    paymentType: settled.payment_type ?? null,
    orderId: settled.order_id ?? null,
  });
}
