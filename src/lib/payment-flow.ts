import { createPaymentSnapToken, openMidtransSnap } from "@/lib/payment-stub";

/** Lewati Midtrans Snap — untuk uji alur order. Set false saat go-live pembayaran. */
export function isPaymentBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_BYPASS === "true";
}

/**
 * Jalankan pembayaran checkout (hanya saat Midtrans aktif).
 * Mode bypass ditangani di API place-delivery.
 */
export async function runCheckoutPayment(orderId: string, grossAmount: number) {
  if (isPaymentBypassEnabled()) {
    return { bypassed: true as const };
  }

  const token = await createPaymentSnapToken(orderId, grossAmount);
  openMidtransSnap(token);
  return { bypassed: false as const };
}
