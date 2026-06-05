import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "wira_bridge_tokens";

type Tokens = { access_token: string; refresh_token: string };

export function getNativeAccessToken(): string | null {
  return readStoredTokens()?.access_token ?? null;
}

/** Fetch API driver — sertakan Bearer dari APK WebView bila cookie tidak ada. */
export async function fetchWithDriverAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getNativeAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, credentials: "include", headers });
}

function readStoredTokens(): Tokens | null {
  if (typeof window === "undefined") return null;

  const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
  if (w.__WIRA_NATIVE_SESSION__?.access_token && w.__WIRA_NATIVE_SESSION__?.refresh_token) {
    return w.__WIRA_NATIVE_SESSION__;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Tokens;
    if (parsed.access_token && parsed.refresh_token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Terapkan token dari APK native — hanya sekali per tab, jangan putar refresh token berulang. */
export async function ensureDriverNativeSession(supabase: SupabaseClient): Promise<void> {
  const w = window as Window & { __WIRA_NATIVE_SESSION_APPLIED__?: boolean };
  if (w.__WIRA_NATIVE_SESSION_APPLIED__) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    w.__WIRA_NATIVE_SESSION_APPLIED__ = true;
    return;
  }

  const tokens = readStoredTokens();
  if (!tokens) return;

  try {
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error) {
      console.warn("[driver native session]", error.message);
      return;
    }
    w.__WIRA_NATIVE_SESSION_APPLIED__ = true;
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("[driver native session]", e);
  }
}
