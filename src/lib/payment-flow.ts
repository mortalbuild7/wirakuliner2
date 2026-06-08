import type { QrisPaymentData } from "@/components/payment/qris-payment-panel";

/** Lewati Midtrans — untuk uji alur order. Set false saat go-live pembayaran. */
export function isPaymentBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true";
}

export type CreateQrisParams = {
  type: "topup" | "ngojek" | "food";
  amount: number;
  orderId?: string;
  merchantId?: string;
};

/** Buat pembayaran Midtrans (topup / ngojek / food) — QRIS inline atau Snap. */
export async function createMidtransPayment(params: CreateQrisParams) {
  return createQrisPayment(params);
}

export async function createQrisPayment(
  params: CreateQrisParams
): Promise<QrisPaymentData> {
  const res = await fetch("/api/payment/create-qris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      type: params.type,
      amount: params.amount,
      orderId: params.orderId,
      merchantId: params.merchantId,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    mode?: "qris" | "snap";
    midtransOrderId?: string;
    grossAmount?: number;
    orderId?: string | null;
    message?: string;
    qris?: QrisPaymentData["qris"];
    snap?: QrisPaymentData["snap"];
  };

  if (!res.ok) {
    throw new Error(json.error ?? "Gagal membuat QRIS");
  }

  if (!json.midtransOrderId) {
    throw new Error("Respons pembayaran tidak lengkap");
  }

  if (json.mode === "snap" && json.snap?.redirectUrl) {
    return {
      midtransOrderId: json.midtransOrderId,
      grossAmount: json.grossAmount ?? params.amount,
      orderId: json.orderId ?? params.orderId ?? null,
      mode: "snap",
      snap: json.snap,
      message: json.message,
    };
  }

  if (!json.qris) {
    throw new Error("Respons QRIS tidak lengkap");
  }

  return {
    midtransOrderId: json.midtransOrderId,
    grossAmount: json.grossAmount ?? params.amount,
    orderId: json.orderId ?? params.orderId ?? null,
    mode: "qris",
    qris: json.qris,
    message: json.message,
  };
}

/** @deprecated Gunakan createQrisPayment — disimpan untuk kompatibilitas. */
export async function runCheckoutPayment(orderId: string, grossAmount: number) {
  if (isPaymentBypassEnabled()) {
    return { bypassed: true as const };
  }
  const qris = await createQrisPayment({
    type: "food",
    amount: grossAmount,
    orderId,
  });
  return { bypassed: false as const, qris };
}
