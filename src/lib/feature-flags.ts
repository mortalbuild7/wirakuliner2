/** Set DRIVER_APP_ENABLED=false di Vercel untuk menutup aplikasi driver. */
export function isDriverAppEnabled(): boolean {
  return process.env.DRIVER_APP_ENABLED !== "false";
}

/** Untuk komponen client (bundle browser). */
export function isDriverAppEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_DRIVER_APP_ENABLED !== "false";
}

export const DRIVER_CLOSED_MESSAGE =
  "Aplikasi driver sementara tidak tersedia. Hubungi admin WIRA Kuliner.";

/** Panel Admin di beranda — default disembunyikan (route /admin tetap aktif). */
export function isHomeAdminPanelVisible(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_HOME_ADMIN === "true";
}

/** Panel Driver di beranda — default disembunyikan (route /driver tetap aktif). */
export function isHomeDriverPanelVisible(): boolean {
  return (
    process.env.NEXT_PUBLIC_SHOW_HOME_DRIVER === "true" && isDriverAppEnabled()
  );
}
