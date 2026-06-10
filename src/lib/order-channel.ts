import type { OrderStatus, ServiceType } from "@/types/database";
import { ORDER_STATUS_LABEL } from "@/lib/order-flow";

/** Order row / API payload — alamat + service_type ENUM. */
export type OrderChannelRecord = {
  delivery_address: string;
  service_type?: ServiceType | null;
};

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

export type TransitKind = "ngojek" | "ngomobil" | "paket";

const TRANSIT_PASSENGER_DRIVER_STATUS: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Menunggu bayar",
  paid: "Mencari driver",
  preparing: "Mencari driver",
  ready_for_pickup: "Menuju jemput",
  on_the_way: "Menuju tujuan",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

const PAKET_DRIVER_STATUS: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Menunggu bayar",
  paid: "Mencari driver kurir",
  preparing: "Mencari driver kurir",
  ready_for_pickup: "Menuju pengirim",
  on_the_way: "Mengantar paket",
  delivered: "Paket terkirim",
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

/** Label status di panel driver — transit tidak memakai istilah merchant. */
export function driverOrderStatusLabel(
  deliveryAddress: string,
  status: OrderStatus
): string {
  if (isPaketOrder(deliveryAddress)) {
    return PAKET_DRIVER_STATUS[status] ?? status;
  }
  if (isTransitOrder(deliveryAddress)) {
    return TRANSIT_PASSENGER_DRIVER_STATUS[status] ?? status;
  }
  return FOOD_DRIVER_STATUS[status] ?? ORDER_STATUS_LABEL[status] ?? status;
}

/** Jenis layanan transit dari prefix alamat. */
export function getTransitKind(deliveryAddress: string): TransitKind | null {
  if (isPaketOrder(deliveryAddress)) return "paket";
  if (isNgomobilOrder(deliveryAddress)) return "ngomobil";
  if (isNgojekOrder(deliveryAddress)) return "ngojek";
  return null;
}

/** Parse jemput → tujuan untuk semua layanan transit. */
export function parseTransitLegs(deliveryAddress: string): {
  pickup: string;
  destination: string;
} | null {
  if (!isTransitOrder(deliveryAddress)) return null;

  const prefix = deliveryAddress.startsWith(PAKET_ADDRESS_PREFIX)
    ? PAKET_ADDRESS_PREFIX
    : deliveryAddress.startsWith(NGOMOBIL_ADDRESS_PREFIX)
      ? NGOMOBIL_ADDRESS_PREFIX
      : NGOJEK_ADDRESS_PREFIX;

  const rest = deliveryAddress.slice(prefix.length).trim();
  const arrow = rest.indexOf("→");
  if (arrow < 0) return { pickup: rest, destination: "" };
  return {
    pickup: rest.slice(0, arrow).trim(),
    destination: rest.slice(arrow + 1).trim(),
  };
}

/** Status UI tracker — transit tidak menampilkan tahap merchant/preparing. */
export function effectiveTransitStepStatus(
  deliveryAddress: string,
  status: OrderStatus | string
): OrderStatus | string {
  if (isTransitOrder(deliveryAddress) && status === "preparing") {
    return "paid";
  }
  return status;
}

export function isPaketOrderRecord(order: OrderChannelRecord) {
  return isPaketOrder(order.delivery_address) || order.service_type === "PAKET";
}

export function isTransitOrderRecord(order: OrderChannelRecord) {
  return (
    isTransitOrder(order.delivery_address) ||
    order.service_type === "NGOJEK" ||
    order.service_type === "NGOMOBIL" ||
    order.service_type === "PAKET"
  );
}

export function getTransitKindFromRecord(order: OrderChannelRecord): TransitKind | null {
  const fromAddress = getTransitKind(order.delivery_address);
  if (fromAddress) return fromAddress;
  if (order.service_type === "PAKET") return "paket";
  if (order.service_type === "NGOMOBIL") return "ngomobil";
  if (order.service_type === "NGOJEK") return "ngojek";
  return null;
}

/** Label kanal untuk UI — fallback ke service_type bila prefix alamat hilang. */
export function channelLabelFromRecord(order: OrderChannelRecord) {
  const kind = getTransitKindFromRecord(order);
  if (kind === "paket") return PAKET_LABEL;
  if (kind === "ngomobil") return NGOMOBIL_LABEL;
  if (kind === "ngojek") return NGOJEK_LABEL;
  return channelLabel(order.delivery_address);
}

/** Index langkah tracker — transit tidak punya tahap preparing/merchant. */
export function effectiveTrackerStepStatus(
  order: OrderChannelRecord,
  status: OrderStatus | string
): OrderStatus | string {
  if (isTransitOrderRecord(order) && status === "preparing") {
    return "paid";
  }
  return status;
}

/** Label status di halaman Lacak Pesanan — transit/PAKET tanpa istilah merchant. */
export function customerTrackerStatusLabel(order: {
  delivery_address: string;
  service_type?: ServiceType | null;
  order_status: OrderStatus;
  driver_id: string | null;
}): string {
  const isTransit = isTransitOrderRecord(order);
  const isPaket = isPaketOrderRecord(order);
  const { order_status, driver_id } = order;

  const searchingDriver =
    !driver_id && ["paid", "preparing", "ready_for_pickup"].includes(order_status);

  if (searchingDriver) {
    return isPaket ? "Mencari kurir..." : isTransit ? "Mencari driver..." : ORDER_STATUS_LABEL.paid;
  }

  if (isPaket) {
    if (order_status === "preparing" || order_status === "paid") return "Mencari kurir...";
    if (order_status === "ready_for_pickup") {
      return driver_id ? "Kurir menuju pengirim" : "Mencari kurir...";
    }
    if (order_status === "on_the_way") return "Mengantar paket";
    if (order_status === "delivered") return "Paket terkirim";
  }

  if (isTransit) {
    if (order_status === "preparing" || order_status === "paid") return "Mencari driver...";
    if (order_status === "ready_for_pickup") {
      return driver_id ? "Driver menuju titik jemput" : "Mencari driver...";
    }
    if (order_status === "on_the_way") return "Menuju tujuan";
    if (order_status === "delivered") return "Sampai";
  }

  return ORDER_STATUS_LABEL[order_status] ?? order_status;
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
  return parseTransitLegs(deliveryAddress);
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
