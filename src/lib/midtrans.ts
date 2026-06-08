import { createHash } from "crypto";

export type MidtransPaymentType = "topup" | "ngojek" | "food";

const COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0.10");

export function getPlatformCommissionRate(): number {
  return Number.isFinite(COMMISSION_RATE) && COMMISSION_RATE >= 0 && COMMISSION_RATE < 1
    ? COMMISSION_RATE
    : 0.1;
}

export function isMidtransConfigured(): boolean {
  return Boolean(process.env.MIDTRANS_SERVER_KEY?.trim());
}

export function getMidtransBaseUrl(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

export function midtransAuthHeader(): string {
  const key = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** TOPUP-{32hex} atau ORDER-{32hex} — max 50 karakter Midtrans. */
export function buildMidtransOrderId(type: MidtransPaymentType, referenceId: string): string {
  const compact = referenceId.replace(/-/g, "");
  const prefix = type === "topup" ? "TOPUP" : "ORDER";
  return `${prefix}-${compact}`;
}

export function parseMidtransOrderId(midtransOrderId: string): {
  kind: "topup" | "order";
  referenceId: string | null;
} {
  if (midtransOrderId.startsWith("TOPUP-")) {
    const hex = midtransOrderId.slice(6);
    if (hex.length !== 32) return { kind: "topup", referenceId: null };
    return {
      kind: "topup",
      referenceId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    };
  }
  if (midtransOrderId.startsWith("ORDER-")) {
    const hex = midtransOrderId.slice(6);
    if (hex.length !== 32) return { kind: "order", referenceId: null };
    return {
      kind: "order",
      referenceId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    };
  }
  return { kind: "order", referenceId: null };
}

export type QrisChargeResult = {
  transactionId: string;
  orderId: string;
  grossAmount: number;
  qrString: string | null;
  qrUrl: string | null;
  acquirer: string | null;
  raw: Record<string, unknown>;
};

/** Midtrans Core API — charge QRIS dinamis. */
export async function chargeMidtransQris(params: {
  orderId: string;
  grossAmount: number;
  customerName?: string;
}): Promise<QrisChargeResult> {
  const body: Record<string, unknown> = {
    payment_type: "qris",
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.grossAmount),
    },
    qris: { acquirer: process.env.MIDTRANS_QRIS_ACQUIRER ?? "gopay" },
  };

  if (params.customerName?.trim()) {
    body.customer_details = { first_name: params.customerName.trim().slice(0, 60) };
  }

  const res = await fetch(`${getMidtransBaseUrl()}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: midtransAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg =
      (json.status_message as string) ||
      (json.error_messages as string[] | undefined)?.join(", ") ||
      "Gagal membuat QRIS Midtrans";
    throw new Error(msg);
  }

  const actions = Array.isArray(json.actions) ? json.actions : [];
  let qrUrl: string | null = null;
  let qrString: string | null = null;

  for (const action of actions) {
    const a = action as Record<string, unknown>;
    const name = String(a.name ?? "").toLowerCase();
    if (name === "generate-qr-code-v2" || name === "generate-qr-code") {
      qrUrl = (a.url as string) ?? null;
    }
    if (name === "qr-code") {
      qrString = (a.url as string) ?? null;
    }
  }

  const qris = json.qris as Record<string, unknown> | undefined;
  if (!qrString && qris?.qr_string) {
    qrString = String(qris.qr_string);
  }

  return {
    transactionId: String(json.transaction_id ?? ""),
    orderId: params.orderId,
    grossAmount: Math.round(params.grossAmount),
    qrString,
    qrUrl,
    acquirer: (qris?.acquirer as string) ?? null,
    raw: json,
  };
}

export type MidtransNotification = {
  order_id: string;
  transaction_status: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_id?: string;
  payment_type?: string;
};

/** Verifikasi signature webhook Midtrans (SHA-512). */
export function verifyMidtransSignature(payload: MidtransNotification): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) return false;

  const raw = `${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`;
  const expected = createHash("sha512").update(raw).digest("hex");
  return expected === payload.signature_key;
}

export function isMidtransSettlement(status: string): boolean {
  return status === "settlement" || status === "capture";
}
