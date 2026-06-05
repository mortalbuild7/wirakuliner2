export type PosCashPayment = {
  cashPaid: number;
  change: number;
  total: number;
};

export function orderTotalAmount(
  totalProduct: number,
  deliveryFee: number = 0
): number {
  return Number(totalProduct) + Number(deliveryFee);
}

export function calcChange(total: number, cashPaid: number): number {
  if (cashPaid < total) return 0;
  return cashPaid - total;
}

export function parseCashPaidInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

const POS_CASH_PREFIX = "pos_cash:";

/** Simpan di snap_token agar struk bisa dicetak ulang */
export function encodePosCashSnap(payment: PosCashPayment): string {
  return `${POS_CASH_PREFIX}${JSON.stringify({
    paid: payment.cashPaid,
    change: payment.change,
    total: payment.total,
  })}`;
}

export function decodePosCashSnap(snapToken: string | null): PosCashPayment | null {
  if (!snapToken?.startsWith(POS_CASH_PREFIX)) return null;
  try {
    const raw = JSON.parse(snapToken.slice(POS_CASH_PREFIX.length)) as {
      paid?: number;
      change?: number;
      total?: number;
    };
    if (typeof raw.paid !== "number" || typeof raw.change !== "number") return null;
    return {
      cashPaid: raw.paid,
      change: raw.change,
      total: typeof raw.total === "number" ? raw.total : raw.paid - raw.change,
    };
  } catch {
    return null;
  }
}
