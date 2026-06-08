"use server";

/**
 * ALUR KEUANGAN — Pemanggilan Supabase RPC `handle_withdraw` dari Server Action.
 *
 * Race condition: dua request withdraw simultan → request kedua menunggu
 * `FOR UPDATE` di PostgreSQL lalu gagal "Saldo tidak mencukupi".
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthDriver } from "@/lib/driver-server";
import { WALLET_WITHDRAW_MAX, WALLET_WITHDRAW_MIN } from "@/lib/wallet";
import { detectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import { sanitizePublicText } from "@/lib/security/sanitize";

export type WithdrawDriverResult =
  | { ok: true; balance: number; withdrawalId: string }
  | { ok: false; error: string };

export async function withdrawDriverBalanceAction(input: {
  amount: number;
  method: "ewallet" | "va_bank";
  destination: string;
  destinationName?: string;
}): Promise<WithdrawDriverResult> {
  const idorMsg = detectTrustedOwnerIdsInBody(input as unknown as Record<string, unknown>);
  if (idorMsg) return { ok: false, error: idorMsg };

  const auth = await getAuthDriver();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < WALLET_WITHDRAW_MIN || amount > WALLET_WITHDRAW_MAX) {
    return { ok: false, error: "Nominal penarikan tidak valid" };
  }

  const destination = sanitizePublicText(input.destination, 80);
  if (!destination || destination.length < 5) {
    return { ok: false, error: "Tujuan penarikan tidak valid" };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("handle_withdraw", {
    driver_id_param: auth.driver.id,
    amount_param: amount,
    method_param: input.method,
    destination_param: destination,
    destination_name_param: sanitizePublicText(input.destinationName, 120),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    balance?: number;
    withdrawal_id?: string;
  };

  if (!result.ok || !result.withdrawal_id) {
    return { ok: false, error: "Penarikan gagal" };
  }

  return {
    ok: true,
    balance: Number(result.balance ?? 0),
    withdrawalId: result.withdrawal_id,
  };
}
