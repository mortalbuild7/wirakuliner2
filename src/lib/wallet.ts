import type { SupabaseClient } from "@supabase/supabase-js";
import { isNgojekOrder } from "@/lib/order-channel";

export type WalletOwnerType = "customer" | "driver" | "merchant";
export type WalletTopupMethod = "ewallet" | "va_bank";

type WalletRpcResult = string;

async function applyWalletTx(
  admin: SupabaseClient,
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  txType:
    | "topup_ewallet"
    | "topup_va"
    | "order_payment"
    | "order_earning"
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
      "id, payment_method, delivery_address, delivery_fee, total_product_amount, merchant_id, driver_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.payment_method !== "wallet" || !order.driver_id) {
    return { distributed: false };
  }

  const deliveryFee = Number(order.delivery_fee ?? 0);
  const productAmount = Number(order.total_product_amount ?? 0);
  const isNgojek = isNgojekOrder(order.delivery_address ?? "");

  if (isNgojek) {
    if (deliveryFee > 0) {
      await applyWalletTx(
        admin,
        "driver",
        order.driver_id,
        deliveryFee,
        "order_earning",
        { orderId, note: "Pendapatan NGOJEK" }
      );
    }
  } else if (order.merchant_id && productAmount > 0) {
    await applyWalletTx(
      admin,
      "merchant",
      order.merchant_id,
      productAmount,
      "order_earning",
      { orderId, note: "Pendapatan pesanan kuliner" }
    );
    if (deliveryFee > 0) {
      await applyWalletTx(
        admin,
        "driver",
        order.driver_id,
        deliveryFee,
        "order_earning",
        { orderId, note: "Ongkos kirim kuliner" }
      );
    }
  }

  return { distributed: true };
}
