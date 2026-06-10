import { sanitizePublicText } from "@/lib/security/sanitize";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape entitas HTML — lapisan kedua anti Stored XSS jika pesan pernah
 * dirender di luar React text node (email, notifikasi, admin export).
 */
export function escapeHtmlEntities(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Sterilisasi pesan chat sebelum INSERT ke `order_chats`.
 * 1. Strip tag & event handler (sanitizePublicText)
 * 2. Escape < > & " ' untuk defense-in-depth
 */
export function sanitizeChatMessageForStorage(
  value: unknown,
  maxLen = 1000
): string | null {
  const stripped = sanitizePublicText(value, maxLen);
  if (!stripped) return null;
  return escapeHtmlEntities(stripped);
}

/** Decode entitas aman untuk tampilan React text node (bukan dangerouslySetInnerHTML). */
export function decodeStoredChatEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
