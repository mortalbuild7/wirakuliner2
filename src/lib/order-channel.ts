/** Prefix di delivery_address untuk membedakan pesanan on-the-spot tanpa migrasi wajib. */
export const POS_ADDRESS_PREFIX = "[POS]";
export const DINE_IN_ADDRESS_PREFIX = "[DI TEMPAT]";
export const NGOJEK_ADDRESS_PREFIX = "[NGOJEK]";

export type OrderChannel = "delivery" | "dine_in" | "pos" | "ngojek";

export function formatPosAddress(guestName?: string) {
  const name = guestName?.trim();
  return name
    ? `${POS_ADDRESS_PREFIX} Beli di tempat — ${name}`
    : `${POS_ADDRESS_PREFIX} Beli di tempat (kasir)`;
}

export function formatDineInAddress(merchantName: string) {
  return `${DINE_IN_ADDRESS_PREFIX} ${merchantName}`;
}

/** Alamat ride: jemput → tujuan (koordinat di kolom pickup_* & delivery_*). */
export function formatNgojekAddress(pickupLabel: string, destinationLabel: string) {
  const pickup = pickupLabel.trim() || "Lokasi jemput";
  const dest = destinationLabel.trim() || "Lokasi tujuan";
  return `${NGOJEK_ADDRESS_PREFIX} ${pickup} → ${dest}`;
}

export function parseNgojekLegs(deliveryAddress: string): {
  pickup: string;
  destination: string;
} | null {
  if (!isNgojekOrder(deliveryAddress)) return null;
  const rest = deliveryAddress.slice(NGOJEK_ADDRESS_PREFIX.length).trim();
  const arrow = rest.indexOf("→");
  if (arrow < 0) return { pickup: rest, destination: "" };
  return {
    pickup: rest.slice(0, arrow).trim(),
    destination: rest.slice(arrow + 1).trim(),
  };
}

export function parseOrderChannel(deliveryAddress: string): OrderChannel {
  if (deliveryAddress.startsWith(POS_ADDRESS_PREFIX)) return "pos";
  if (deliveryAddress.startsWith(DINE_IN_ADDRESS_PREFIX)) return "dine_in";
  if (deliveryAddress.startsWith(NGOJEK_ADDRESS_PREFIX)) return "ngojek";
  return "delivery";
}

export function isNgojekOrder(deliveryAddress: string) {
  return deliveryAddress.startsWith(NGOJEK_ADDRESS_PREFIX);
}

export function isOnsiteOrder(deliveryAddress: string) {
  const ch = parseOrderChannel(deliveryAddress);
  return ch === "pos" || ch === "dine_in";
}

export function channelLabel(deliveryAddress: string) {
  const ch = parseOrderChannel(deliveryAddress);
  if (ch === "pos") return "Kasir (walk-in)";
  if (ch === "dine_in") return "Pesan di tempat";
  if (ch === "ngojek") return "NGOJEK";
  return "Antar";
}
