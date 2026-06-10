import type { SupabaseClient } from "@supabase/supabase-js";
import { isNgojekOrder } from "@/lib/order-channel";
import { splitDriverDeliveryFee } from "@/lib/revenue-split";

export type WalletOwnerType = "customer" | "driver" | "merchant";
export type WalletTopupMethod = "ewallet" | "va_bank";
export type WalletWithdrawMethod = "ewallet" | "va_bank";

/**
 * Mutasi saldo atomik via RPC `wallet_apply_tx` (PostgreSQL):
 * SELECT ... FOR UPDATE pada baris wallet → cegah race condition withdraw/topup simultan.
 * Request kedua menunggu lock lalu gagal jika saldo tidak cukup.
 */
export const WALLET_WITHDRAW_MIN = 10_000;
export const WALLET_WITHDRAW_MAX = 50_000_000;
export const WALLET_WITHDRAW_PRESETS = [
  10_000,
  50_000,
  100_000,
  200_000,
  500_000,
] as const;

const MIN_WITHDRAW = WALLET_WITHDRAW_MIN;
const MAX_WITHDRAW = WALLET_WITHDRAW_MAX;

type WalletRpcResult = string;

async function applyWalletTx(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  txType:
    | "topup_ewallet"
    | "topup_va"
    | "topup_qris"
    | "order_payment"
    | "order_earning"
    | "withdraw_ewallet"
    | "withdraw_va"
    | "adjustment",
  opts?: { orderId?: string; topupRef?: string; note?: string }
): Promise<string> {
  const { data, error } = await admin.rpc("wallet_apply_tx", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_amount: amount,
    p_tx_type: txType,
    p_order_id: opts?.orderId ?? null,
    p_topup_ref: opts?.topupRef ?? null,
    p_note: opts?.note ?? null,
  });

  if (error) {
    if (error.message.includes("Saldo tidak mencukupi")) {
      throw new Error("Saldo tidak mencukupi");
    }
    throw new Error(error.message);
  }

  return data as WalletRpcResult;
}

export async function getWalletBalance(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string
): Promise<number> {
  const { data } = await admin
    .from("wallets")
    .select("balance")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return Number(data?.balance ?? 0);
}

export async function debitCustomerForOrder(
  admin: SupabaseClient,
  customerId: string,
  amount: number,
  orderId: string
): Promise<void> {
  if (amount <= 0) return;
  await applyWalletTx(admin, "customer", customerId, -amount, "order_payment", {
    orderId,
    note: "Pembayaran pesanan",
  });
}

export async function topupWallet(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  method: WalletTopupMethod
): Promise<{ txId: string; balance: number }> {
  if (amount < 10_000) {
    throw new Error("Minimal top up Rp 10.000");
  }
  if (amount > 10_000_000) {
    throw new Error("Maksimal top up Rp 10.000.000");
  }

  const txType = method === "ewallet" ? "topup_ewallet" : "topup_va";
  const ref = `${method.toUpperCase()}_${Date.now()}`;
  const txId = await applyWalletTx(admin, ownerType, ownerId, amount, txType, {
    topupRef: ref,
    note: method === "ewallet" ? "Top up E-Wallet" : "Top up Virtual Account",
  });

  const balance = await getWalletBalance(admin, ownerType, ownerId);
  return { txId, balance };
}

/** Distribusi pendapatan setelah order selesai (hanya pembayaran saldo). */
export async function distributeWalletEarnings(
  admin: SupabaseClient,
  orderId: string
): Promise<{ distributed: boolean }> {
  const { data: existing } = await admin
    .from("wallet_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("tx_type", "order_earning")
    .limit(1);

  if (existing?.length) {
    return { distributed: false };
  }

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, payment_method, delivery_address, delivery_fee, total_product_amount, merchant_product_amount, merchant_id, driver_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.payment_method !== "wallet" || !order.driver_id) {
    return { distributed: false };
  }

  const deliveryFee = Number(order.delivery_fee ?? 0);
  const driverSplit = splitDriverDeliveryFee(deliveryFee);
  const merchantAmount = Number(
    order.merchant_product_amount ?? order.total_product_amount ?? 0
  );
  const isNgojek = isNgojekOrder(order.delivery_address ?? "");

  if (isNgojek) {
    if (driverSplit.driverNet > 0) {
      await applyWalletTx(
        admin,
        "driver",
        order.driver_id,
        driverSplit.driverNet,
        "order_earning",
        {
          orderId,
          note: `Pendapatan NGOJEK (90%, komisi platform ${driverSplit.platformFee})`,
        }
      );
    }
  } else if (order.merchant_id && merchantAmount > 0) {
    await applyWalletTx(
      admin,
      "merchant",
      order.merchant_id,
      merchantAmount,
      "order_earning",
      { orderId, note: "Pendapatan pesanan kuliner (harga merchant)" }
    );
    if (driverSplit.driverNet > 0) {
      await applyWalletTx(
        admin,
        "driver",
        order.driver_id,
        driverSplit.driverNet,
        "order_earning",
        {
          orderId,
          note: `Ongkos kirim kuliner (90%, komisi platform ${driverSplit.platformFee})`,
        }
      );
    }
  }

  return { distributed: true };
}

/** Kredit bagian driver dari pembayaran QRIS Midtrans setelah order selesai. */
export async function distributeMidtransDriverShare(
  admin: SupabaseClient,
  orderId: string,
  driverId: string
): Promise<{ distributed: boolean; amount: number }> {
  const { data: pt } = await admin
    .from("payment_transactions")
    .select(
      "id, payment_type, driver_share, driver_share_paid, status, platform_fee"
    )
    .eq("order_id", orderId)
    .eq("status", "settlement")
    .maybeSingle();

  if (!pt || pt.driver_share_paid || Number(pt.driver_share ?? 0) <= 0) {
    return { distributed: false, amount: 0 };
  }

  const amount = Number(pt.driver_share);
  const note =
    pt.payment_type === "ngojek"
      ? `Pendapatan NGOJEK QRIS (neto setelah komisi ${Number(pt.platform_fee ?? 0)})`
      : "Ongkos kirim kuliner QRIS";

  await applyWalletTx(admin, "driver", driverId, amount, "order_earning", {
    orderId,
    note,
  });

  await admin
    .from("payment_transactions")
    .update({ driver_share_paid: true })
    .eq("id", pt.id);

  return { distributed: true, amount };
}

export async function withdrawWallet(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  method: WalletWithdrawMethod,
  destination: string,
  destinationName?: string | null
): Promise<{ withdrawalId: string; txId: string; balance: number }> {
  if (amount < MIN_WITHDRAW) {
    throw new Error(`Minimal penarikan ${formatWithdrawMin()}`);
  }
  if (amount > MAX_WITHDRAW) {
    throw new Error("Maksimal penarikan Rp 50.000.000");
  }

  const destLabel = destinationName?.trim() || destination;

  if (ownerType === "driver") {
    const { data: rpcResult, error: rpcError } = await admin.rpc("handle_withdraw", {
      driver_id_param: ownerId,
      amount_param: amount,
      method_param: method,
      destination_param: destination,
      destination_name_param: destinationName?.trim() || null,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const payload = (rpcResult ?? {}) as {
      ok?: boolean;
      withdrawal_id?: string;
      wallet_tx_id?: string;
      balance?: number;
    };

    if (!payload.ok || !payload.withdrawal_id) {
      throw new Error("RPC handle_withdraw gagal");
    }

    return {
      withdrawalId: payload.withdrawal_id,
      txId: payload.wallet_tx_id ?? "",
      balance: Number(payload.balance ?? 0),
    };
  }

  const balance = await getWalletBalance(admin, ownerType, ownerId);
  if (balance < amount) {
    throw new Error("Saldo tidak mencukupi");
  }

  const txType = method === "ewallet" ? "withdraw_ewallet" : "withdraw_va";
  const ref = `WD_${method.toUpperCase()}_${Date.now()}`;

  const txId = await applyWalletTx(admin, ownerType, ownerId, -amount, txType, {
    topupRef: ref,
    note:
      method === "ewallet"
        ? `Tarik ke E-Wallet: ${destLabel}`
        : `Tarik ke rekening: ${destLabel}`,
  });

  const { data: row, error } = await admin
    .from("wallet_withdrawals")
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      wallet_tx_id: txId,
      amount,
      method,
      destination,
      destination_name: destinationName?.trim() || null,
      status: "completed",
      processed_at: new Date().toISOString(),
      note: "Penarikan diproses (mode uji)",
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Gagal mencatat penarikan");
  }

  const newBalance = await getWalletBalance(admin, ownerType, ownerId);
  return { withdrawalId: row.id as string, txId, balance: newBalance };
}

export function formatWalletWithdrawMin(): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(WALLET_WITHDRAW_MIN);
}

function formatWithdrawMin(): string {
  return formatWalletWithdrawMin();
}

export async function listWalletWithdrawals(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string,
  limit = 20
) {
  const { data } = await admin
    .from("wallet_withdrawals")
    .select("id, amount, method, destination, destination_name, status, created_at")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
