import type { SupabaseClient } from "@supabase/supabase-js";
import { postNativeSessionSync } from "@/lib/driver-session-sync";

const STORAGE_KEY = "wira_bridge_tokens";

type Tokens = { access_token: string; refresh_token: string };

function isReactNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView
  );
}

/** Simpan token terbaru di memori WebView + sync ke APK native. */
export function storeDriverTokens(tokens: Tokens, syncNative = true): void {
  if (typeof window === "undefined") return;

  const w = window as Window & { __WIRA_NATIVE_SESSION__?: Tokens };
  const prev = w.__WIRA_NATIVE_SESSION__;
  w.__WIRA_NATIVE_SESSION__ = tokens;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    /* ignore */
  }

  if (
    syncNative &&
    isReactNativeWebView() &&
    (!prev ||
      prev.access_token !== tokens.access_token ||
      prev.refresh_token !== tokens.refresh_token)
  ) {
    postNativeSessionSync(tokens);
  }
}

export function getNativeAccessToken(): string | null {
  return readStoredTokens()?.access_token ?? null;
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

/** Ambil access token terbaru — prioritas sesi Supabase web (cookie), bukan token inject lama. */
export async function getDriverAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token && session.refresh_token) {
      storeDriverTokens(
        {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
        true
      );
      return session.access_token;
    }
  } catch {
    /* fallback ke token inject */
  }

  return getNativeAccessToken();
}

/** Fetch API driver — Bearer selalu dari sesi terbaru (hindari token inject kedaluwarsa). */
export async function fetchWithDriverAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = await getDriverAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  return fetch(input, { ...init, credentials: "include", headers });
}

/** Terapkan token dari APK native — sekali per tab. */
export async function ensureDriverNativeSession(supabase: SupabaseClient): Promise<void> {
  const w = window as Window & { __WIRA_NATIVE_SESSION_APPLIED__?: boolean };
  if (w.__WIRA_NATIVE_SESSION_APPLIED__) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    storeDriverTokens(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      false
    );
    w.__WIRA_NATIVE_SESSION_APPLIED__ = true;
    return;
  }

  const tokens = readStoredTokens();
  if (!tokens) return;

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error) {
      console.warn("[driver native session]", error.message);
      return;
    }
    if (data.session) {
      storeDriverTokens(
        {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        true
      );
    }
    w.__WIRA_NATIVE_SESSION_APPLIED__ = true;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn("[driver native session]", e);
  }
}

/** Dengarkan refresh Supabase → sync token ke APK native. */
export function bindDriverNativeSessionSync(supabase: SupabaseClient): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (!session?.access_token || !session.refresh_token) return;
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      storeDriverTokens(
        {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
        true
      );
    }
  });

  return () => subscription.unsubscribe();
}
