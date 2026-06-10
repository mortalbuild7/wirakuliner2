"use server";

/**
 * Server Action — Pembayaran Pesanan Kuliner via Saldo Customer (Wallet)
 *
 * Mitigasi serangan:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 1. Anti price tampering  — harga dari DB `products`, bukan client       │
 * │ 2. Anti IDOR             — user_id dari getUser() HttpOnly, bukan body  │
 * │ 3. Anti race condition   — RPC FOR UPDATE wallet + order atomik         │
 * │ 4. Anti over-posting     — Zod .strict() whitelist field              │
 * │ 5. Anti XSS (alamat)     — sanitizePublicText pada alamat antar         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Alur:
 * validate payload → auth getUser() → hitung harga server → insert order
 * → wallet_pay_pending_order (debit + paid) → notify driver
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { detectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import { executeKulinerWalletPayment } from "@/lib/wallet/pay-kuliner-with-wallet";
import { payKulinerWithWalletSchema } from "@/lib/wallet/wallet-payment-schemas";

export type WalletPaymentActionResult =
  | {
      ok: true;
      orderId: string;
      amountCharged: number;
      deliveryFee: number;
      distanceKm: number;
      paid: true;
      paymentMethod: "wallet";
      driversNotified: boolean;
    }
  | { ok: false; error: string; status?: number };

/**
 * Bayar pesanan kuliner dengan saldo WIRA.
 *
 * @param raw — Hanya `merchantId`, `items[{productId, quantity}]`, opsi alamat/promo.
 *              DILARANG mengirim `total`, `price`, `userId`, `customerId`.
 */
export async function payKulinerOrderWithWallet(
  raw: unknown
): Promise<WalletPaymentActionResult> {
  const idorMsg = detectTrustedOwnerIdsInBody(
    typeof raw === "object" && raw != null ? (raw as Record<string, unknown>) : {}
  );
  if (idorMsg) {
    return { ok: false, error: idorMsg, status: 403 };
  }

  const parsed = payKulinerWithWalletSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid", status: 400 };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Silakan login sebagai customer", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "customer") {
    return { ok: false, error: "Hanya customer yang dapat membayar dengan saldo", status: 403 };
  }

  const admin = createAdminClient();
  const result = await executeKulinerWalletPayment(admin, user.id, parsed.data);

  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  return {
    ok: true,
    orderId: result.orderId,
    amountCharged: result.amountCharged,
    deliveryFee: result.deliveryFee,
    distanceKm: result.distanceKm,
    paid: true,
    paymentMethod: "wallet",
    driversNotified: result.driversNotified,
  };
}
