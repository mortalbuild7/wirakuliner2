import { randomUUID } from "crypto";
import { isNgojekOrder } from "@/lib/order-channel";
import {
  buildMidtransOrderId,
  chargeMidtransQris,
  createMidtransSnap,
  isMidtransConfigured,
  isMidtransPreferSnap,
  type MidtransPaymentType,
} from "@/lib/midtrans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, parseBoundedNumber } from "@/lib/security/validate";

function orderTotal(
  productAmount: number,
  deliveryFee: number
): number {
  return Math.round(productAmount + deliveryFee);
}

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "payment-create-qris", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  if (!isMidtransConfigured()) {
    return secureJsonResponse(
      { error: "Midtrans belum dikonfigurasi (MIDTRANS_SERVER_KEY)" },
      { status: 503 }
    );
  }

  const parsed = await readJsonBody<{
    type?: string;
    amount?: number;
    orderId?: string;
    bookingId?: string;
    merchantId?: string;
    userId?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const paymentType = parsed.data.type as MidtransPaymentType | undefined;
  if (!paymentType || !["topup", "ngojek", "food"].includes(paymentType)) {
    return secureJsonResponse(
      { error: "type wajib: topup, ngojek, atau food" },
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
  const orderId = parsed.data.orderId ?? parsed.data.bookingId;
  let grossAmount = 0;
  let referenceId = randomUUID();
  let customerName: string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, phone")
    .eq("id", user.id)
    .maybeSingle();
  customerName = profile?.name ?? undefined;
  const customerPhone = profile?.phone ?? undefined;
  const customerEmail = user.email ?? undefined;

  if (paymentType === "topup") {
    const amount = parseBoundedNumber(parsed.data.amount, 10_000, 10_000_000);
    if (amount == null) {
      return secureJsonResponse(
        { error: "Nominal top up antara Rp 10.000 – Rp 10.000.000" },
        { status: 400 }
      );
    }
    grossAmount = amount;
    referenceId = randomUUID();
  } else {
    if (!isValidUuid(orderId)) {
      return secureJsonResponse(
        { error: "orderId / bookingId wajib untuk ngojek & food" },
        { status: 400 }
      );
    }

    const { data: order } = await admin
      .from("orders")
      .select(
        "id, customer_id, order_status, delivery_address, total_product_amount, delivery_fee, merchant_id"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!order || order.customer_id !== user.id) {
      return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    if (order.order_status !== "pending_payment") {
      return secureJsonResponse(
        { error: "Pesanan sudah dibayar atau tidak menunggu pembayaran" },
        { status: 400 }
      );
    }

    const isNgojek = isNgojekOrder(order.delivery_address ?? "");
    if (paymentType === "ngojek" && !isNgojek) {
      return secureJsonResponse({ error: "Bukan pesanan NGOJEK" }, { status: 400 });
    }
    if (paymentType === "food" && isNgojek) {
      return secureJsonResponse({ error: "Bukan pesanan kuliner" }, { status: 400 });
    }

    if (parsed.data.merchantId && parsed.data.merchantId !== order.merchant_id) {
      return secureJsonResponse({ error: "merchantId tidak sesuai pesanan" }, { status: 400 });
    }

    grossAmount = orderTotal(
      Number(order.total_product_amount ?? 0),
      Number(order.delivery_fee ?? 0)
    );
    referenceId = order.id;

    const bodyAmount = parseBoundedNumber(parsed.data.amount, 1, 50_000_000);
    if (bodyAmount != null && bodyAmount !== grossAmount) {
      return secureJsonResponse(
        { error: "Nominal tidak sesuai total pesanan" },
        { status: 400 }
      );
    }
  }

  const midtransOrderId = buildMidtransOrderId(paymentType, referenceId);

  let pendingQuery = admin
    .from("payment_transactions")
    .select(
      "id, midtrans_order_id, qris_url, qris_string, gross_amount, status"
    )
    .eq("customer_id", user.id)
    .eq("status", "pending")
    .eq("payment_type", paymentType);

  pendingQuery =
    paymentType === "topup"
      ? pendingQuery.eq("gross_amount", grossAmount)
      : pendingQuery.eq("order_id", referenceId);

  const { data: existingPending } = await pendingQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existingPending?.qris_string &&
    Number(existingPending.gross_amount) === grossAmount
  ) {
    return secureJsonResponse({
      ok: true,
      midtransOrderId: existingPending.midtrans_order_id,
      grossAmount,
      paymentType,
      orderId: paymentType === "topup" ? null : referenceId,
      qris: {
        qrString: existingPending.qris_string,
        qrUrl: existingPending.qris_url,
      },
      reused: true,
    });
  }

  const { data: ptRow, error: ptInsertErr } = await admin
    .from("payment_transactions")
    .insert({
      midtrans_order_id: midtransOrderId,
      payment_type: paymentType,
      customer_id: user.id,
      gross_amount: grossAmount,
      order_id: paymentType === "topup" ? null : referenceId,
      status: "pending",
    })
    .select("id")
    .single();

  if (ptInsertErr || !ptRow) {
    return secureJsonResponse(
      { error: ptInsertErr?.message ?? "Gagal mencatat transaksi" },
      { status: 500 }
    );
  }

  const snapParams = {
    orderId: midtransOrderId,
    grossAmount,
    customerName,
    customerEmail,
    customerPhone,
  };

  const respondSnap = async () => {
    const snap = await createMidtransSnap(snapParams);
    await admin
      .from("payment_transactions")
      .update({
        qris_url: snap.redirectUrl,
        midtrans_transaction_id: snap.token,
      })
      .eq("id", ptRow.id);

    return secureJsonResponse({
      ok: true,
      mode: "snap",
      midtransOrderId,
      grossAmount,
      paymentType,
      orderId: paymentType === "topup" ? null : referenceId,
      snap: {
        token: snap.token,
        redirectUrl: snap.redirectUrl,
      },
    });
  };

  try {
    if (isMidtransPreferSnap()) {
      return await respondSnap();
    }

    const charge = await chargeMidtransQris({
      orderId: midtransOrderId,
      grossAmount,
      customerName,
    });

    await admin
      .from("payment_transactions")
      .update({
        qris_acquirer: charge.acquirer,
        qris_url: charge.qrUrl,
        qris_string: charge.qrString,
        midtrans_transaction_id: charge.transactionId || null,
      })
      .eq("id", ptRow.id);

    if (!charge.qrString && !charge.qrUrl) {
      return secureJsonResponse(
        { error: "Midtrans tidak mengembalikan data QRIS" },
        { status: 502 }
      );
    }

    return secureJsonResponse({
      ok: true,
      mode: "qris",
      midtransOrderId,
      grossAmount,
      paymentType,
      orderId: paymentType === "topup" ? null : referenceId,
      transactionId: charge.transactionId,
      qris: {
        qrString: charge.qrString,
        qrUrl: charge.qrUrl,
        acquirer: charge.acquirer,
      },
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "";
    const useSnapFallback =
      errMsg.includes("belum diaktifkan") ||
      errMsg.toLowerCase().includes("not activated");

    if (useSnapFallback) {
      try {
        return await respondSnap();
      } catch (snapErr) {
        await admin
          .from("payment_transactions")
          .update({ status: "cancel" })
          .eq("id", ptRow.id);

        return secureJsonResponse(
          {
            error:
              snapErr instanceof Error ? snapErr.message : "Gagal membuat pembayaran",
          },
          { status: 502 }
        );
      }
    }

    await admin
      .from("payment_transactions")
      .update({ status: "cancel" })
      .eq("id", ptRow.id);

    return secureJsonResponse(
      { error: errMsg || "Gagal membuat QRIS" },
      { status: 502 }
    );
  }
}
