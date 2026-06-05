import type { Merchant } from "@/types/database";

/** Cover etalase: foto merchant, atau foto menu pertama yang punya gambar */
export function getMerchantEtalaseImage(
  merchant: Merchant,
  menuCoverByMerchantId: Map<string, string>
): string | null {
  if (merchant.image_url?.trim()) return merchant.image_url;
  return menuCoverByMerchantId.get(merchant.id) ?? null;
}

export function buildMenuCoverMap(
  rows: { merchant_id: string; image_url: string | null }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.image_url?.trim() && !map.has(row.merchant_id)) {
      map.set(row.merchant_id, row.image_url);
    }
  }
  return map;
}
