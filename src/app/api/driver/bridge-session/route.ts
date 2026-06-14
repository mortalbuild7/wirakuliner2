import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
} from "@/lib/security/enforce";
import { applySecurityHeaders } from "@/lib/security/headers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const BRIDGE_SERVER_TIMEOUT_MS = 8_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Set cookie sesi Supabase dari token login native (WebView APK). */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-bridge", RATE_LIMITS.driverBridge);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    access_token?: string;
    refresh_token?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const { access_token, refresh_token } = parsed.data;
  if (!access_token || !refresh_token) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Token tidak lengkap" }, { status: 400 })
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const jwtClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jwtUser, error: jwtErr } = await withTimeout(
    jwtClient.auth.getUser(access_token),
    BRIDGE_SERVER_TIMEOUT_MS,
    "Validasi token"
  );

  if (jwtErr || !jwtUser.user) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: jwtErr?.message ?? "Token tidak valid" },
        { status: 401 }
      )
    );
  }

  const cookieStore = await cookies();
  let response = NextResponse.json({ ok: true });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const admin = createAdminClient();
  const profileResult = await withTimeout(
    admin.from("profiles").select("role").eq("id", jwtUser.user.id).single(),
    BRIDGE_SERVER_TIMEOUT_MS,
    "Cek profil"
  );
  const profile = profileResult.data;

  if (profile?.role !== "driver") {
    return applySecurityHeaders(
      NextResponse.json({ error: "Bukan akun driver" }, { status: 403 })
    );
  }

  const { error: sessErr } = await withTimeout(
    supabase.auth.setSession({ access_token, refresh_token }),
    BRIDGE_SERVER_TIMEOUT_MS,
    "Set sesi"
  );

  if (sessErr) {
    return applySecurityHeaders(
      NextResponse.json({ error: sessErr.message }, { status: 401 })
    );
  }

  return applySecurityHeaders(response);
}
