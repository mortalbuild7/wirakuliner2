/**
 * Midtrans / Xendit payment gateway stub.
 * Replace with Snap API call in production API route.
 */
export async function createPaymentSnapToken(
  orderId: string,
  grossAmount: number
): Promise<string> {
  // POST to /api/payment/create with server-side MIDTRANS_SERVER_KEY
  const res = await fetch("/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, grossAmount }),
  });
  const json = await res.json();
  return json.snap_token ?? `STUB_SNAP_${orderId}`;
}

export function openMidtransSnap(snapToken: string) {
  if (typeof window !== "undefined" && (window as unknown as { snap?: { pay: (t: string) => void } }).snap) {
    (window as unknown as { snap: { pay: (t: string) => void } }).snap.pay(snapToken);
  } else {
    alert(`Stub Midtrans Snap — token: ${snapToken}\nIntegrate Midtrans.js on checkout page.`);
  }
}
