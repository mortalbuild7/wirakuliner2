import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
} from "@/lib/security/enforce";
import { applySecurityHeaders } from "@/lib/security/headers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Set cookie sesi Supabase dari token login native (WebView APK). */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "driver-bridge", RATE_LIMITS.auth);
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

  const cookieStore = await cookies();
  let response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    return applySecurityHeaders(
      NextResponse.json({ error: error.message }, { status: 401 })
    );
  }

  const userId = data.session?.user?.id;
  if (!userId) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 })
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "driver") {
    await supabase.auth.signOut();
    return applySecurityHeaders(
      NextResponse.json({ error: "Bukan akun driver" }, { status: 403 })
    );
  }

  return applySecurityHeaders(response);
}
