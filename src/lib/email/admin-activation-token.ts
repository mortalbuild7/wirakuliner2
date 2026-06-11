import "server-only";
import { createHash, randomBytes } from "crypto";

/** Masa berlaku token aktivasi — batasi window serangan replay token curian. */
export const ADMIN_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export type ActivationTokenRecord = {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
};

/** Hasilkan token 256-bit + hash SHA-256 — raw token tidak disimpan di DB. */
export function generateAdminActivationToken(): ActivationTokenRecord {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + ADMIN_ACTIVATION_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
}

/** Hash token dari URL — dibandingkan dengan baris DB tanpa menyimpan plaintext. */
export function hashActivationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
