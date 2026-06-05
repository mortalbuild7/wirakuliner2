import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnsiteOrder } from "@/lib/order-channel";
import { calcChange, encodePosCashSnap, orderTotalAmount } from "@/lib/pos-cash";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, parseBoundedNumber } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "pos-pay", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  try {
    const parsed = await readJsonBody<{ orderId?: string; cashPaid?: number }>(req);
    if ("error" in parsed) return parsed.error;
    const { orderId, cashPaid: cashRaw } = parsed.data;

    if (!orderId || !isValidUuid(orderId)) {
      return secureJsonResponse({ error: "orderId tidak valid" }, { status: 400 });
    }

    const cashPaid =
      cashRaw == null ? undefined : parseBoundedNumber(cashRaw, 0, 100_000_000);
    if (cashRaw != null && cashPaid === null) {
      return secureJsonResponse({ error: "Nominal bayar tidak valid" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return secureJsonResponse({ error: "Belum login" }, { status: 401 });
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!merchant) {
      return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select(
        "id, merchant_id, order_status, delivery_address, total_product_amount, delivery_fee, snap_token"
      )
      .eq("id", orderId)
      .single();

    if (!order || order.merchant_id !== merchant.id) {
      return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    if (!isOnsiteOrder(order.delivery_address)) {
      return secureJsonResponse({ error: "Bukan pesanan on-the-spot" }, { status: 400 });
    }

    if (order.order_status === "paid") {
      const { data: existing } = await admin
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .single();
      return secureJsonResponse({ ok: true, order: existing });
    }

    if (order.order_status !== "pending_payment" && order.order_status !== "preparing") {
      return secureJsonResponse(
        { error: `Status tidak bisa dibayar: ${order.order_status}` },
        { status: 400 }
      );
    }

    const total = orderTotalAmount(
      Number(order.total_product_amount),
      Number(order.delivery_fee)
    );

    let snapToken: string | undefined;
    let change = 0;

    if (cashPaid != null && cashPaid > 0) {
      if (cashPaid < total) {
        return secureJsonResponse(
          { error: `Uang kurang. Total ${total}, diterima ${cashPaid}` },
          { status: 400 }
        );
      }
      change = calcChange(total, cashPaid);
      snapToken = encodePosCashSnap({ cashPaid, change, total });
    }

    const { data: updated, error } = await admin
      .from("orders")
      .update({
        order_status: "paid",
        ...(snapToken ? { snap_token: snapToken } : {}),
      })
      .eq("id", orderId)
      .select("*, order_items(*)")
      .single();

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }

    return secureJsonResponse({
      ok: true,
      order: updated,
      cashPaid: cashPaid ?? null,
      change,
      total,
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal konfirmasi pembayaran" },
      { status: 500 }
    );
  }
}
