/**
 * Ekstrak pesan error asli dari Error, PostgREST, Supabase RPC, atau unknown.
 * Dipakai server action agar UI HP menampilkan detail transparan.
 */
export function extractServerErrorMessage(error: unknown): string {
  if (error == null) return "Unknown Server Error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Unknown Server Error";

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts: string[] = [];

    if (typeof record.message === "string" && record.message.trim()) {
      parts.push(record.message.trim());
    }
    if (typeof record.details === "string" && record.details.trim()) {
      parts.push(record.details.trim());
    }
    if (typeof record.hint === "string" && record.hint.trim()) {
      parts.push(`hint: ${record.hint.trim()}`);
    }
    if (typeof record.code === "string" && record.code.trim()) {
      parts.push(`code: ${record.code.trim()}`);
    }

    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown Server Error";
    }
  }

  return String(error);
}
