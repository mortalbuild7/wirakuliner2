/**
 * Origin aplikasi production — dipakai untuk link absolut (email, OG, redirect eksternal).
 * Di browser, selalu pakai `window.location.origin` agar cocok di domain mana pun.
 */
const PRODUCTION_ORIGIN = "https://wirakuliner.web.id";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return PRODUCTION_ORIGIN;
}

/** Path admin — relatif, aman di localhost maupun production. */
export const ADMIN_PATHS = {
  login: "/admin/login",
  dashboard: "/admin",
  drivers: "/admin/drivers",
  merchants: "/admin/merchants",
} as const;

export function adminUrl(path: keyof typeof ADMIN_PATHS): string {
  return `${getAppOrigin()}${ADMIN_PATHS[path]}`;
}
