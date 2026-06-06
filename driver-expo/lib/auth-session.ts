import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

function isInvalidRefreshError(message?: string) {
  return Boolean(
    message &&
      (/refresh token/i.test(message) || /invalid.*token/i.test(message))
  );
}

export async function clearLocalAuth() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }
}

/** Pulihkan sesi native; bersihkan storage jika refresh token sudah tidak valid. */
export async function restoreNativeSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isInvalidRefreshError(error.message)) {
      await clearLocalAuth();
      return null;
    }

    const session = data.session;
    if (!session) return null;

    const { data: userCheck, error: userErr } = await supabase.auth.getUser(
      session.access_token
    );
    if (!userErr && userCheck.user) {
      return session;
    }

    const exp = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (exp >= now + 60) return session;

    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      if (isInvalidRefreshError(refreshErr.message)) {
        await clearLocalAuth();
      }
      return null;
    }

    return refreshed.session;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isInvalidRefreshError(msg)) {
      await clearLocalAuth();
    }
    return null;
  }
}

export async function syncNativeSession(tokens: {
  access_token: string;
  refresh_token: string;
}) {
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error) {
    if (isInvalidRefreshError(error.message)) {
      await clearLocalAuth();
    }
    return null;
  }
  return data.session;
}
