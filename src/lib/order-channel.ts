/** Prefix di delivery_address untuk membedakan pesanan on-the-spot tanpa migrasi wajib. */
export const POS_ADDRESS_PREFIX = "[POS]";
export const DINE_IN_ADDRESS_PREFIX = "[DI TEMPAT]";

export type OrderChannel = "delivery" | "dine_in" | "pos";

export function formatPosAddress(guestName?: string) {
  const name = guestName?.trim();
  return name
    ? `${POS_ADDRESS_PREFIX} Beli di tempat — ${name}`
    : `${POS_ADDRESS_PREFIX} Beli di tempat (kasir)`;
}

export function formatDineInAddress(merchantName: string) {
  return `${DINE_IN_ADDRESS_PREFIX} ${merchantName}`;
}

export function parseOrderChannel(deliveryAddress: string): OrderChannel {
  if (deliveryAddress.startsWith(POS_ADDRESS_PREFIX)) return "pos";
  if (deliveryAddress.startsWith(DINE_IN_ADDRESS_PREFIX)) return "dine_in";
  return "delivery";
}

export function isOnsiteOrder(deliveryAddress: string) {
  const ch = parseOrderChannel(deliveryAddress);
  return ch === "pos" || ch === "dine_in";
}

export function channelLabel(deliveryAddress: string) {
  const ch = parseOrderChannel(deliveryAddress);
  if (ch === "pos") return "Kasir (walk-in)";
  if (ch === "dine_in") return "Pesan di tempat";
  return "Antar";
}
