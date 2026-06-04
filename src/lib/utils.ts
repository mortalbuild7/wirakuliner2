import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function merchantNameFromJoin(
  merchants: { name: string } | { name: string }[] | null | undefined,
  fallback = "Unknown"
): string {
  if (!merchants) return fallback;
  if (Array.isArray(merchants)) return merchants[0]?.name ?? fallback;
  return merchants.name ?? fallback;
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}
