"use server";

/**
 * ALUR HARGA & PROMO — Server Actions (Anti Parameter Tampering)
 *
 * Keamanan:
 * - Harga diambil dari tabel `products` via service role / server query.
 * - Frontend HANYA mengirim productId, quantity, promoCode.
 * - Total, ongkir, dan diskon dihitung di sini — tidak pernah percaya angka dari client.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDineInAddress } from "@/lib/order-channel";
import { isStoreOpen } from "@/lib/merchant-open";
import {
  applyPromoCode,
  computeDeliveryFeeServer,
  computeSubtotal,
  fetchServerSidePrices,
  type OrderLineInput,
} from "@/lib/order-pricing";
import { detectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import { sanitizePublicText } from "@/lib/security/sanitize";
import { isValidUuid, parseBoundedNumber } from "@/lib/security/validate";

export type CreateOrderInput = {
  merchantId: string;
  items: OrderLineInput[];
  promoCode?: string;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  dineIn?: boolean;
};

export type CreateOrderResult =
  | {
      ok: true;
      subtotal: number;
      discount: number;
      deliveryFee: number;
      total: number;
      pricedLines: Awaited<ReturnType<typeof fetchServerSidePrices>>;
    }
  | { ok: false; error: string };

/**
 * Menghitung total pesanan di server — dipanggil sebelum insert order
 * atau untuk preview checkout yang aman.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const idorMsg = detectTrustedOwnerIdsInBody(input as unknown as Record<string, unknown>);
  if (idorMsg) {
    return { ok: false, error: idorMsg };
  }

  if (!isValidUuid(input.merchantId)) {
    return { ok: false, error: "Toko tidak valid" };
  }

  const lines = (input.items ?? [])
    .filter((i) => i && isValidUuid(i.productId))
    .map((i) => ({
      productId: i.productId,
      quantity: parseBoundedNumber(i.quantity, 1, 99) ?? 0,
    }))
    .filter((i) => i.quantity > 0);

  if (!lines.length || lines.length > 50) {
    return { ok: false, error: "Keranjang tidak valid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Silakan login" };
  }

  const admin = createAdminClient();

  const { data: merchant } = await admin
    .from("merchants")
    .select("id, name, latitude, longitude, is_open, is_active, admin_suspended")
    .eq("id", input.merchantId)
    .maybeSingle();

  if (!merchant || !merchant.is_active || merchant.admin_suspended) {
    return { ok: false, error: "Toko tidak tersedia" };
  }

  if (!isStoreOpen(merchant)) {
    return { ok: false, error: "Toko sedang tutup" };
  }

  try {
    const pricedLines = await fetchServerSidePrices(admin, input.merchantId, lines);
    const subtotalRaw = computeSubtotal(pricedLines);
    const promo = await applyPromoCode(admin, input.promoCode, subtotalRaw);

    const dineIn = input.dineIn === true;
    const deliveryLat = dineIn
      ? merchant.latitude
      : parseBoundedNumber(input.deliveryLat, -90, 90);
    const deliveryLng = dineIn
      ? merchant.longitude
      : parseBoundedNumber(input.deliveryLng, -180, 180);

    if (deliveryLat == null || deliveryLng == null) {
      return { ok: false, error: "Koordinat antar wajib diisi" };
    }

    const { deliveryFee } = computeDeliveryFeeServer(
      merchant.latitude,
      merchant.longitude,
      merchant.name,
      deliveryLat,
      deliveryLng,
      dineIn
    );

    const total = promo.subtotalAfter + deliveryFee;

    return {
      ok: true,
      subtotal: promo.subtotalBefore,
      discount: promo.discountAmount,
      deliveryFee,
      total,
      pricedLines,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal menghitung pesanan",
    };
  }
}

/** Helper: alamat aman untuk insert order. */
export async function sanitizeDeliveryAddress(
  merchantName: string,
  raw?: string,
  dineIn?: boolean
): Promise<string | null> {
  if (dineIn) return formatDineInAddress(merchantName);
  return sanitizePublicText(raw, 500);
}
