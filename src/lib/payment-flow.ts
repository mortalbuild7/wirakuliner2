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
    midtransOrderId?: string;
    grossAmount?: number;
    orderId?: string | null;
    qris?: QrisPaymentData["qris"];
  };

  if (!res.ok) {
    throw new Error(json.error ?? "Gagal membuat QRIS");
  }

  if (!json.midtransOrderId || !json.qris) {
    throw new Error("Respons QRIS tidak lengkap");
  }

  return {
    midtransOrderId: json.midtransOrderId,
    grossAmount: json.grossAmount ?? params.amount,
    orderId: json.orderId ?? params.orderId ?? null,
    qris: json.qris,
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
