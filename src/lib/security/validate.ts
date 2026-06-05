import { containsSqlInjection } from "@/lib/security/sql-guard";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validasi UUID — cegah injection pada filter Supabase */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Sanitasi teks bebas — buang tag & batasi panjang (XSS / payload) */
export function sanitizeText(
  value: unknown,
  maxLen = 500
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .trim();
  if (!cleaned || cleaned.length > maxLen) return null;
  return cleaned;
}

export function parsePositiveInt(value: unknown, max = 1_000_000): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.floor(n);
}

export function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

export function parseBoundedNumber(
  value: unknown,
  min: number,
  max: number
): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Tolak string yang mengandung pola SQL injection sebelum diproses. */
export function rejectIfSqlInjection(
  value: unknown,
  fieldName = "input"
): string | { error: string } {
  if (typeof value !== "string") return { error: `${fieldName} tidak valid` };
  if (containsSqlInjection(value)) {
    return { error: "Input mengandung pola tidak diizinkan" };
  }
  const cleaned = sanitizeText(value);
  if (!cleaned) return { error: `${fieldName} tidak valid` };
  return cleaned;
}
