import type { OrderStatus } from "@/types/database";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";

/** Prefix di delivery_address untuk membedakan pesanan on-the-spot tanpa migrasi wajib. */
export const POS_ADDRESS_PREFIX = "[POS]";
export const DINE_IN_ADDRESS_PREFIX = "[DI TEMPAT]";
export const NGOJEK_ADDRESS_PREFIX = "[NGOJEK]";
export const NGOMOBIL_ADDRESS_PREFIX = "[NGOMOBIL]";
export const PAKET_ADDRESS_PREFIX = "[PAKET]";

export const KULINER_FOOD_LABEL = "KULINER FOOD";
export const NGOJEK_LABEL = "NGOJEK";
export const NGOMOBIL_LABEL = "NGOMOBIL";
export const PAKET_LABEL = "PAKET";

export type OrderChannel = "delivery" | "dine_in" | "pos" | "ngojek" | "ngomobil" | "paket";

const NGOJEK_DRIVER_STATUS: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Menunggu bayar",
  paid: "Mencari driver",
  preparing: "Mencari driver",
  ready_for_pickup: "Menuju jemput",
  on_the_way: "Menuju tujuan",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

const FOOD_DRIVER_STATUS: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Menunggu bayar",
  paid: "Order baru",
  preparing: "Diproses toko",
  ready_for_pickup: "Siap diambil",
  on_the_way: "Dalam perjalanan",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

/** Label status di panel driver — NGOJEK tidak memakai istilah merchant/siap diambil. */
export function driverOrderStatusLabel(
  deliveryAddress: string,
  status: OrderStatus
): string {
  if (isTransitOrder(deliveryAddress)) {
    return NGOJEK_DRIVER_STATUS[status] ?? status;
  }
  return FOOD_DRIVER_STATUS[status] ?? ORDER_STATUS_LABEL[status] ?? status;
}

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
  return formatTransitAddress(NGOJEK_ADDRESS_PREFIX, pickupLabel, destinationLabel);
}

export function formatNgomobilAddress(pickupLabel: string, destinationLabel: string) {
  return formatTransitAddress(NGOMOBIL_ADDRESS_PREFIX, pickupLabel, destinationLabel);
}

export function formatPaketAddress(pickupLabel: string, destinationLabel: string) {
  return formatTransitAddress(PAKET_ADDRESS_PREFIX, pickupLabel, destinationLabel);
}

function formatTransitAddress(prefix: string, pickupLabel: string, destinationLabel: string) {
  const pickup = pickupLabel.trim() || "Lokasi jemput";
  const dest = destinationLabel.trim() || "Lokasi tujuan";
  return `${prefix} ${pickup} → ${dest}`;
}

/** Format alamat transit sesuai jenis layanan ENUM. */
export function formatTransitAddressByService(
  serviceType: "NGOJEK" | "NGOMOBIL" | "PAKET",
  pickupLabel: string,
  destinationLabel: string
) {
  if (serviceType === "NGOMOBIL") return formatNgomobilAddress(pickupLabel, destinationLabel);
  if (serviceType === "PAKET") return formatPaketAddress(pickupLabel, destinationLabel);
  return formatNgojekAddress(pickupLabel, destinationLabel);
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
  if (deliveryAddress.startsWith(NGOMOBIL_ADDRESS_PREFIX)) return "ngomobil";
  if (deliveryAddress.startsWith(PAKET_ADDRESS_PREFIX)) return "paket";
  return "delivery";
}

export function isNgojekOrder(deliveryAddress: string) {
  return deliveryAddress.startsWith(NGOJEK_ADDRESS_PREFIX);
}

export function isNgomobilOrder(deliveryAddress: string) {
  return deliveryAddress.startsWith(NGOMOBIL_ADDRESS_PREFIX);
}

export function isPaketOrder(deliveryAddress: string) {
  return deliveryAddress.startsWith(PAKET_ADDRESS_PREFIX);
}

/** Semua layanan transit (motor, mobil, paket) — bukan kuliner/POS. */
export function isTransitOrder(deliveryAddress: string) {
  return (
    isNgojekOrder(deliveryAddress) ||
    isNgomobilOrder(deliveryAddress) ||
    isPaketOrder(deliveryAddress)
  );
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
  if (ch === "ngomobil") return "NGOMOBIL";
  if (ch === "paket") return "PAKET";
  return "Antar";
}
