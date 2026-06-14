import { createHash } from "crypto";

export type MidtransPaymentType = "topup" | "ngojek" | "food";

import { PLATFORM_SHARE_RATE } from "@/lib/revenue-split";

const COMMISSION_RATE = Number(
  process.env.PLATFORM_COMMISSION_RATE ?? String(PLATFORM_SHARE_RATE)
);

/** Komisi aplikasi dari ongkir / NGOJEK (default 10%). */
export function getPlatformCommissionRate(): number {
  return Number.isFinite(COMMISSION_RATE) && COMMISSION_RATE >= 0 && COMMISSION_RATE < 1
    ? COMMISSION_RATE
    : PLATFORM_SHARE_RATE;
}

export function getMidtransServerKey(): string {
  return process.env.MIDTRANS_SERVER_KEY?.trim() ?? "";
}

export function isMidtransConfigured(): boolean {
  return Boolean(getMidtransServerKey());
}

export function isMidtransProduction(): boolean {
  return process.env.MIDTRANS_IS_PRODUCTION === "true";
}

/** Langsung Snap (tanpa coba Core API QRIS) — dipakai jika QRIS Core belum diaktifkan di Midtrans. */
export function isMidtransPreferSnap(): boolean {
  return process.env.MIDTRANS_PREFER_SNAP === "true";
}

export function getMidtransBaseUrl(): string {
  return isMidtransProduction()
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

export function midtransAuthHeader(): string {
  const key = getMidtransServerKey();
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function midtransStatusOk(statusCode: unknown): boolean {
  const code = String(statusCode ?? "");
  return code === "200" || code === "201";
}

/** Pesan error Midtrans yang lebih jelas untuk pengguna. */
export function formatMidtransError(
  statusCode: unknown,
  statusMessage: unknown
): string {
  const code = String(statusCode ?? "");
  const msg = String(statusMessage ?? "").trim();

  if (code === "401" || msg.toLowerCase().includes("unknown merchant")) {
    if (isMidtransProduction()) {
      return "Server Key Midtrans tidak valid. Periksa MIDTRANS_SERVER_KEY di Vercel.";
    }
    return (
      "Server Key tidak cocok dengan Sandbox. Gunakan kunci Sandbox di dashboard Midtrans, " +
      "atau set MIDTRANS_IS_PRODUCTION=true jika memakai kunci Production."
    );
  }

  if (code === "402" || msg.toLowerCase().includes("not activated")) {
    return (
      "Kanal QRIS belum diaktifkan di akun Midtrans Anda. " +
      "Aktifkan GoPay QRIS di Settings → Configuration → Payment Methods, " +
      "atau hubungi support@midtrans.com (Merchant ID: " +
      (process.env.MIDTRANS_MERCHANT_ID ?? "—") +
      ")."
    );
  }

  return msg || "Gagal membuat QRIS Midtrans";
}

const MIDTRANS_ORDER_ID_MAX = 50;

/** TOPUP-{32hex} atau ORDER-{32hex} — max 50 karakter Midtrans. */
export function buildMidtransOrderId(type: MidtransPaymentType, referenceId: string): string {
  return buildMidtransOrderIdWithRetry(type, referenceId, 1);
}

/** ID unik per percobaan bayar — hindari bentrok setelah transaksi cancel/gagal. */
export function buildMidtransOrderIdWithRetry(
  type: MidtransPaymentType,
  referenceId: string,
  attempt: number
): string {
  const compact = referenceId.replace(/-/g, "");
  const prefix = type === "topup" ? "TOPUP" : "ORDER";

  if (attempt <= 1) {
    const id = `${prefix}-${compact}`;
    if (id.length <= MIDTRANS_ORDER_ID_MAX) return id;
    return `${prefix}-${compact.slice(0, MIDTRANS_ORDER_ID_MAX - prefix.length - 1)}`;
  }

  const suffix = `R${attempt}`;
  const maxCompact = MIDTRANS_ORDER_ID_MAX - prefix.length - 1 - suffix.length;
  return `${prefix}-${compact.slice(0, Math.max(8, maxCompact))}-${suffix}`;
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

export function getMidtransSnapBaseUrl(): string {
  return isMidtransProduction()
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

export type SnapChargeResult = {
  token: string;
  redirectUrl: string;
};

/** Midtrans Snap — fallback jika Core API QRIS belum diaktifkan. */
export async function createMidtransSnap(params: {
  orderId: string;
  grossAmount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<SnapChargeResult> {
  const body: Record<string, unknown> = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.grossAmount),
    },
    // Tanpa enabled_payments — tampilkan semua kanal yang sudah diaktifkan di dashboard Midtrans.
  };

  const customer: Record<string, string> = {};
  if (params.customerName?.trim()) {
    customer.first_name = params.customerName.trim().slice(0, 60);
  }
  if (params.customerEmail?.trim()) {
    customer.email = params.customerEmail.trim().slice(0, 60);
  }
  if (params.customerPhone?.trim()) {
    customer.phone = params.customerPhone.trim().slice(0, 20);
  }
  if (Object.keys(customer).length) {
    body.customer_details = customer;
  }

  const res = await fetch(`${getMidtransSnapBaseUrl()}/snap/v1/transactions`, {
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
    const rawMsg =
      (json.error_messages as string[] | undefined)?.join(", ") ||
      (json.status_message as string) ||
      "Gagal membuat pembayaran Snap";
    throw new Error(formatMidtransError(json.status_code, rawMsg));
  }

  const token = String(json.token ?? "");
  const redirectUrl = String(json.redirect_url ?? "");
  if (!token || !redirectUrl) {
    throw new Error("Respons Snap Midtrans tidak lengkap");
  }

  return { token, redirectUrl };
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

  if (!res.ok || !midtransStatusOk(json.status_code)) {
    const rawMsg =
      (json.status_message as string) ||
      (json.error_messages as string[] | undefined)?.join(", ") ||
      "Gagal membuat QRIS Midtrans";
    throw new Error(formatMidtransError(json.status_code, rawMsg));
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

/**
 * Verifikasi signature webhook Midtrans (SHA-512).
 * Rumus resmi: SHA512(order_id + status_code + gross_amount + ServerKey)
 * Webhook tanpa signature valid = fake notification → harus ditolak.
 */
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
