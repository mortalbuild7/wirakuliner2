/**
 * Bagi hasil WIRA Kuliner
 *
 * Driver (NGOJEK & ongkir kuliner): 90% driver, 10% aplikasi
 * Produk merchant: harga input merchant + markup Rp 1.000/unit untuk aplikasi
 */

export const DRIVER_SHARE_RATE = 0.9;
export const PLATFORM_SHARE_RATE = 0.1;
export const PLATFORM_PRODUCT_MARKUP_IDR = 1_000;

export type DriverFeeSplit = {
  driverNet: number;
  platformFee: number;
  gross: number;
};

export type ProductLineSplit = {
  merchantUnitPrice: number;
  customerUnitPrice: number;
  platformMarkupPerUnit: number;
  quantity: number;
  merchantLineTotal: number;
  customerLineTotal: number;
  platformMarkupLineTotal: number;
};

export type OrderProductSplit = {
  lines: ProductLineSplit[];
  merchantProductTotal: number;
  platformMarkupTotal: number;
  customerProductTotal: number;
};

/** Harga yang ditampilkan ke customer (base merchant + markup aplikasi). */
export function customerUnitPrice(merchantBasePrice: number): number {
  const base = Number(merchantBasePrice);
  if (!Number.isFinite(base) || base < 0) return 0;
  return base + PLATFORM_PRODUCT_MARKUP_IDR;
}

/** Bagi hasil ongkir / tarif NGOJEK: 90% driver, 10% aplikasi. */
export function splitDriverDeliveryFee(grossFee: number): DriverFeeSplit {
  const gross = Math.max(0, Math.round(Number(grossFee) * 100) / 100);
  const platformFee = Math.round(gross * PLATFORM_SHARE_RATE);
  const driverNet = Math.max(0, gross - platformFee);
  return { driverNet, platformFee, gross };
}

export function buildProductLineSplit(
  merchantUnitPrice: number,
  quantity: number
): ProductLineSplit {
  const qty = Math.min(Math.max(Math.floor(quantity), 1), 99);
  const merchant = Math.max(0, Number(merchantUnitPrice));
  const customer = customerUnitPrice(merchant);
  const markup = PLATFORM_PRODUCT_MARKUP_IDR;

  return {
    merchantUnitPrice: merchant,
    customerUnitPrice: customer,
    platformMarkupPerUnit: markup,
    quantity: qty,
    merchantLineTotal: merchant * qty,
    customerLineTotal: customer * qty,
    platformMarkupLineTotal: markup * qty,
  };
}

export function aggregateProductSplit(
  lines: ProductLineSplit[]
): OrderProductSplit {
  const merchantProductTotal = lines.reduce((s, l) => s + l.merchantLineTotal, 0);
  const platformMarkupTotal = lines.reduce((s, l) => s + l.platformMarkupLineTotal, 0);
  const customerProductTotal = lines.reduce((s, l) => s + l.customerLineTotal, 0);

  return {
    lines,
    merchantProductTotal,
    platformMarkupTotal,
    customerProductTotal,
  };
}

/**
 * Setelah diskon promo: merchant tetap dapat harga input;
 * aplikasi menyerap diskon dari bagian markup terlebih dahulu.
 */
export function applyPromoToProductSplit(
  split: OrderProductSplit,
  customerSubtotalAfterPromo: number
): {
  merchantProductTotal: number;
  platformMarkupTotal: number;
  customerProductTotal: number;
} {
  const merchantProductTotal = split.merchantProductTotal;
  let platformMarkupTotal = split.platformMarkupTotal;
  const customerProductTotal = Math.max(0, customerSubtotalAfterPromo);
  const discount = Math.max(0, split.customerProductTotal - customerProductTotal);
  platformMarkupTotal = Math.max(0, platformMarkupTotal - discount);

  return { merchantProductTotal, platformMarkupTotal, customerProductTotal };
}
