"use client";

import { toast } from "sonner";

function formatErrorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  if (err != null) return String(err);
  return "";
}

/** Toast ringan — tanpa alert pop-up yang memblokir layar di HP. */
export function notifyCustomerOrderToast(
  message: string,
  variant: "error" | "warning" | "info" = "error"
): void {
  if (variant === "warning") toast.warning(message);
  else if (variant === "info") toast.message(message);
  else toast.error(message);
}

/** Toast + log — untuk error submit; tidak memunculkan window.alert. */
export function notifyCustomerOrderError(message: string, err?: unknown): void {
  const detail = formatErrorDetail(err);
  notifyCustomerOrderToast(message, "error");
  console.error("[customer-order]", message, detail || err);
}

export function notifyCustomerOrderInfo(message: string): void {
  notifyCustomerOrderToast(message, "info");
}

export type GeolocationGuardResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Cek dukungan GPS browser & protokol HTTPS sebelum `navigator.geolocation`.
 */
export function assertCustomerGeolocationReady(): GeolocationGuardResult {
  if (typeof window === "undefined") return { ok: true };

  if (!navigator.geolocation) {
    return {
      ok: false,
      message: "HP Anda tidak mendukung fitur GPS browser.",
    };
  }

  const { protocol, hostname } = window.location;
  const localHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");

  if (protocol !== "https:" && !localHost) {
    return {
      ok: false,
      message:
        "Peringatan Keamanan: Fitur GPS diblokir browser karena tautan belum menggunakan HTTPS murni. Aktifkan SSL/HTTPS pada hosting/domain Anda.",
    };
  }

  return { ok: true };
}

/** Laporkan field validasi yang gagal — padanan `onValidationError` React Hook Form. */
export function notifyFormValidationErrors(
  errors: Record<string, unknown> | string[]
): void {
  const keys = Array.isArray(errors) ? errors : Object.keys(errors);
  const message = `Form belum lengkap! Kolom bermasalah: ${keys.join(", ")}`;
  notifyCustomerOrderToast(message, "warning");
  console.log("Detail Error Form:", errors);
}

export function withCustomerOrderTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} — waktu habis (${Math.round(ms / 1000)} detik)`));
      }, ms);
    }),
  ]);
}
