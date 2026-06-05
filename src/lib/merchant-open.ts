import type { Merchant } from "@/types/database";

/** Jika kolom belum dimigrasi, anggap toko buka agar tidak break */
export function isStoreOpen(merchant: Pick<Merchant, "is_open"> | { is_open?: boolean }) {
  return merchant.is_open !== false;
}

export function storeStatusLabel(open: boolean) {
  return open ? "Sedang buka" : "Tutup";
}
