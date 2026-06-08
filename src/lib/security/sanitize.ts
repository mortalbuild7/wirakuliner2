/**
 * Sanitasi input teks publik — mitigasi Stored XSS.
 * Setara express-validator + xss: strip tag HTML, event handler, javascript: URI.
 */

const SCRIPT_PROTOCOL = /javascript\s*:/gi;
const EVENT_HANDLERS = /\bon\w+\s*=/gi;
const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|link|style|meta|base|form|svg|math)[^>]*>/gi;

/** Hapus tag & karakter kontrol; untuk nama menu, deskripsi resto, komentar driver. */
export function sanitizePublicText(
  value: unknown,
  maxLen = 500
): string | null {
  if (typeof value !== "string") return null;

  let cleaned = value
    .replace(DANGEROUS_TAGS, "")
    .replace(/<[^>]*>/g, "")
    .replace(SCRIPT_PROTOCOL, "")
    .replace(EVENT_HANDLERS, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .trim();

  if (!cleaned || cleaned.length > maxLen) return null;
  return cleaned;
}

/** Deskripsi boleh sedikit lebih panjang (resto / produk). */
export function sanitizeDescription(value: unknown): string | null {
  return sanitizePublicText(value, 2_000);
}

/** Nama entitas — pendek & ketat. */
export function sanitizeName(value: unknown): string | null {
  return sanitizePublicText(value, 120);
}
