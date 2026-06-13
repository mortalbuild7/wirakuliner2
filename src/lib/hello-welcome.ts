export const HAS_WELCOMED_KEY = "has_welcomed";
export const FRESH_LOGIN_KEY = "wira_fresh_login";

/** Tandai sesi login baru — dipanggil dari halaman login/register sebelum redirect. */
export function markFreshLogin(): void {
  try {
    sessionStorage.setItem(FRESH_LOGIN_KEY, "1");
  } catch {
    /* private mode / WebView */
  }
}

export function shouldShowHelloWelcome(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(HAS_WELCOMED_KEY) === "true") return false;
    return sessionStorage.getItem(FRESH_LOGIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeHelloWelcome(): void {
  try {
    sessionStorage.removeItem(FRESH_LOGIN_KEY);
    localStorage.setItem(HAS_WELCOMED_KEY, "true");
  } catch {
    /* ignore */
  }
}
