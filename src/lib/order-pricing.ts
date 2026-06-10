import type { SupabaseClient } from "@supabase/supabase-js";
import { deliveryZoneCenter, distanceToZone } from "@/lib/geo-config";
import { calculateDeliveryFee } from "@/lib/delivery-fee";
import {
  aggregateProductSplit,
  applyPromoToProductSplit,
  buildProductLineSplit,
  type OrderProductSplit,
} from "@/lib/revenue-split";

/**
 * ALUR HARGA & PROMO — Anti Parameter Tampering
 * Harga merchant diambil dari `products.price`; customer membayar + markup Rp 1.000/unit.
 */

export type OrderLineInput = {
  productId: string;
  quantity: number;
};

export type PricedLine = {
  productId: string;
  name: string;
  quantity: number;
  /** Harga input merchant (dasar bagi hasil merchant) */
  merchantUnitPrice: number;
  /** Harga customer per unit (merchant + markup aplikasi) */
  unitPrice: number;
  lineTotal: number;
  merchantLineTotal: number;
  platformMarkupLineTotal: number;
};

export type PromoResult = {
  code: string | null;
  discountAmount: number;
  subtotalBefore: number;
  subtotalAfter: number;
  merchantProductTotal: number;
  platformMarkupTotal: number;
};

export async function fetchServerSidePrices(
  admin: SupabaseClient,
  merchantId: string,
  lines: OrderLineInput[]
): Promise<PricedLine[]> {
  if (!lines.length) return [];

  const ids = [...new Set(lines.map((l) => l.productId))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, name, price, merchant_id, is_available")
    .in("id", ids)
    .eq("merchant_id", merchantId);

  if (error) throw new Error(error.message);

  const byId = new Map(
    (products ?? []).map((p) => [
      p.id as string,
      p as {
        id: string;
        name: string;
        price: number;
        is_available: boolean;
      },
    ])
  );

  const priced: PricedLine[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || !product.is_available) {
      throw new Error(`Produk tidak tersedia: ${line.productId}`);
    }

    const merchantBase = Number(product.price);
    if (!Number.isFinite(merchantBase) || merchantBase < 0) {
      throw new Error("Harga produk tidak valid di database");
    }

    const split = buildProductLineSplit(merchantBase, line.quantity);

    priced.push({
      productId: product.id,
      name: String(product.name),
      quantity: split.quantity,
      merchantUnitPrice: split.merchantUnitPrice,
      unitPrice: split.customerUnitPrice,
      lineTotal: split.customerLineTotal,
      merchantLineTotal: split.merchantLineTotal,
      platformMarkupLineTotal: split.platformMarkupLineTotal,
    });
  }

  return priced;
}

export function computeSubtotal(lines: PricedLine[]): number {
  return lines.reduce((s, l) => s + l.lineTotal, 0);
}

export function computeMerchantSubtotal(lines: PricedLine[]): number {
  return lines.reduce((s, l) => s + l.merchantLineTotal, 0);
}

export function computePlatformMarkup(lines: PricedLine[]): number {
  return lines.reduce((s, l) => s + l.platformMarkupLineTotal, 0);
}

export function toOrderProductSplit(lines: PricedLine[]): OrderProductSplit {
  return aggregateProductSplit(
    lines.map((l) =>
      buildProductLineSplit(l.merchantUnitPrice, l.quantity)
    )
  );
}

export async function applyPromoCode(
  admin: SupabaseClient,
  promoCode: string | null | undefined,
  lines: PricedLine[]
): Promise<PromoResult> {
  const split = toOrderProductSplit(lines);
  const subtotalBefore = split.customerProductTotal;

  const base: PromoResult = {
    code: null,
    discountAmount: 0,
    subtotalBefore,
    subtotalAfter: subtotalBefore,
    merchantProductTotal: split.merchantProductTotal,
    platformMarkupTotal: split.platformMarkupTotal,
  };

  const code = promoCode?.trim().toUpperCase();
  if (!code) return base;

  const { data: promo } = await admin
    .from("promo_codes")
    .select("code, discount_percent, max_discount, min_order_amount, is_active, valid_until")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (!promo) {
    throw new Error("Kode promo tidak valid");
  }

  if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
    throw new Error("Kode promo sudah kedaluwarsa");
  }

  const minOrder = Number(promo.min_order_amount ?? 0);
  if (subtotalBefore < minOrder) {
    throw new Error(`Minimal belanja untuk promo: Rp ${minOrder.toLocaleString("id-ID")}`);
  }

  const pct = Number(promo.discount_percent ?? 0);
  let discount = Math.round((subtotalBefore * pct) / 100);
  const maxDisc = Number(promo.max_discount ?? 0);
  if (maxDisc > 0) discount = Math.min(discount, maxDisc);
  discount = Math.min(discount, subtotalBefore);

  const subtotalAfter = subtotalBefore - discount;
  const adjusted = applyPromoToProductSplit(split, subtotalAfter);

  return {
    code,
    discountAmount: discount,
    subtotalBefore,
    subtotalAfter: adjusted.customerProductTotal,
    merchantProductTotal: adjusted.merchantProductTotal,
    platformMarkupTotal: adjusted.platformMarkupTotal,
  };
}

export function computeDeliveryFeeServer(
  merchantLat: number,
  merchantLng: number,
  merchantName: string,
  deliveryLat: number,
  deliveryLng: number,
  dineIn: boolean
): { deliveryFee: number; distanceKm: number } {
  if (dineIn) return { deliveryFee: 0, distanceKm: 0 };

  const zone = deliveryZoneCenter(merchantLat, merchantLng, merchantName);
  if (!zone) throw new Error("Koordinat toko tidak valid");

  const distanceKm = distanceToZone(deliveryLat, deliveryLng, zone.lat, zone.lng);
  return {
    deliveryFee: calculateDeliveryFee(distanceKm),
    distanceKm,
  };
}

export const MAX_VEHICLE_SPEED_KMH = 120;

export function kmPerHourFromDelta(km: number, seconds: number): number {
  if (seconds <= 0) return Infinity;
  return (km / seconds) * 3600;
}
