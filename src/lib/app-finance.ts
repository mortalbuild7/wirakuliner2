import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRevenueSource = "TRANSPORT_COMMISSION" | "MERCHANT_MARKUP";

export type FinanceSummary = {
  transportCommission: number;
  merchantMarkup: number;
  grandTotal: number;
  ledgerBalance: number;
};

export type FinancialLogRow = {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
};

export type AppWithdrawalRow = {
  id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  note: string | null;
  created_at: string;
};

/**
 * Jalankan settlement atomik via RPC PostgreSQL.
 * Menggantikan `distributeWalletEarnings` + `distributeMidtransDriverShare` agar
 * tidak ada double-credit — idempoten lewat flag `orders.settlement_processed`.
 */
export async function settleOrderFinancials(
  admin: SupabaseClient,
  orderId: string
): Promise<{ ok: boolean; alreadySettled?: boolean; payload?: unknown }> {
  const { data, error } = await admin.rpc("process_order_settlement", {
    order_id_param: orderId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as {
    ok?: boolean;
    already_settled?: boolean;
  };

  return {
    ok: Boolean(payload.ok),
    alreadySettled: Boolean(payload.already_settled),
    payload: data,
  };
}

/** Agregat pendapatan aplikasi dari tabel `app_revenues`. */
export async function fetchFinanceSummary(
  admin: SupabaseClient
): Promise<FinanceSummary> {
  const { data: revenues } = await admin
    .from("app_revenues")
    .select("source_type, amount");

  let transportCommission = 0;
  let merchantMarkup = 0;

  for (const row of revenues ?? []) {
    const amt = Number(row.amount ?? 0);
    if (row.source_type === "TRANSPORT_COMMISSION") {
      transportCommission += amt;
    } else if (row.source_type === "MERCHANT_MARKUP") {
      merchantMarkup += amt;
    }
  }

  const { data: ledger } = await admin
    .from("app_finance_ledger")
    .select("balance")
    .eq("id", 1)
    .maybeSingle();

  const ledgerBalance = Number(ledger?.balance ?? 0);

  return {
    transportCommission,
    merchantMarkup,
    grandTotal: transportCommission + merchantMarkup,
    ledgerBalance,
  };
}

/** Buku besar mutasi kas internal aplikasi dengan filter tanggal opsional. */
export async function fetchFinancialLogs(
  admin: SupabaseClient,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<FinancialLogRow[]> {
  let q = admin
    .from("financial_logs")
    .select("id, type, amount, balance_after, description, created_at")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.from) {
    q = q.gte("created_at", opts.from);
  }
  if (opts?.to) {
    q = q.lte("created_at", opts.to);
  }

  const { data } = await q;
  return (data ?? []) as FinancialLogRow[];
}

export async function fetchAppWithdrawals(
  admin: SupabaseClient,
  limit = 20
): Promise<AppWithdrawalRow[]> {
  const { data } = await admin
    .from("app_withdrawals")
    .select(
      "id, amount, bank_name, account_number, account_holder, note, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AppWithdrawalRow[];
}
