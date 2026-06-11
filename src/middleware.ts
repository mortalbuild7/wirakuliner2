import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/types/database";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/enforce";
import { scanPathname, scanSearchParams } from "@/lib/security/sql-guard";
import { isAccountAccessBlocked } from "@/lib/account-status";
import { DRIVER_CLOSED_MESSAGE, isDriverAppEnabled } from "@/lib/feature-flags";
import { SUPER_ADMIN_DB_ROLE } from "@/lib/admin-auth";

const ROLE_ROUTES: Record<string, UserRole> = {
  "/admin": "admin",
  "/merchant": "merchant",
  "/customer": "customer",
  "/driver": "driver",
};

/** Satu pintu login admin — halaman ini tidak memerlukan sesi. */
const ADMIN_AUTH_EXEMPT_PREFIXES = [
  "/admin/login",
  "/admin/activate",
  "/admin/mfa-verify",
  "/admin/mfa-setup",
  "/admin/mfa-challenge",
] as const;

function isAdminAuthExempt(pathname: string): boolean {
  return ADMIN_AUTH_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function withSecurity(res: NextResponse): NextResponse {
  return applySecurityHeaders(res);
}

function blockedRequestResponse(isApi: boolean) {
  if (isApi) {
    return withSecurity(
      NextResponse.json({ error: "Permintaan ditolak" }, { status: 400 })
    );
  }
  return withSecurity(new NextResponse("Permintaan ditolak", { status: 400 }));
}

/** MFA step-up: admin sudah enroll TOTP tapi sesi masih aal1. */
async function requiresMfaStepUp(
  supabase: ReturnType<typeof createServerClient>
): Promise<boolean> {
  const { data: aal, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aal) return false;
  return aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}

function forwardPathHeader(request: NextRequest, res: NextResponse): NextResponse {
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-pathname", request.nextUrl.pathname);
  const next = NextResponse.next({ request: { headers: reqHeaders } });
  res.cookies.getAll().forEach((c) => next.cookies.set(c.name, c.value));
  return withSecurity(next);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);
  const isApi = pathname.startsWith("/api");

  if (scanPathname(pathname) || scanSearchParams(request.nextUrl.searchParams)) {
    return blockedRequestResponse(isApi);
  }

  /**
   * RATE LIMITING LOGIN ADMIN (lapisan Edge — in-memory 3×/5 menit/IP).
   * Upstash Redis dipanggil di API route (Node) untuk limit terdistribusi antar instance.
   */
  if (request.method === "POST" && pathname === "/api/admin/auth/login") {
    const rl = checkRateLimit(`admin-login-edge:${ip}`, {
      limit: 3,
      windowMs: 5 * 60_000,
    });
    if (!rl.allowed) {
      const res = NextResponse.json(
        { error: "Terlalu banyak percobaan login admin. Coba lagi nanti." },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(rl.retryAfterSec));
      return withSecurity(res);
    }
  }

  if (!isDriverAppEnabled()) {
    if (pathname.startsWith("/api/driver")) {
      return withSecurity(
        NextResponse.json({ error: DRIVER_CLOSED_MESSAGE }, { status: 503 })
      );
    }
    if (pathname.startsWith("/driver")) {
      const home = new URL("/", request.url);
      home.searchParams.set("notice", "driver-closed");
      return withSecurity(NextResponse.redirect(home));
    }
    if (pathname === "/login") {
      const redirect = request.nextUrl.searchParams.get("redirect") ?? "";
      if (redirect.startsWith("/driver")) {
        const login = new URL("/login", request.url);
        login.searchParams.set("notice", "driver-closed");
        return withSecurity(NextResponse.redirect(login));
      }
    }
  }

  if (pathname.startsWith("/api")) {
    const scope = pathname.startsWith("/api/auth")
      ? "auth"
      : pathname.startsWith("/api/admin")
        ? "admin-api"
        : "api";
    const cfg =
      scope === "auth"
        ? RATE_LIMITS.auth
        : scope === "admin-api"
          ? RATE_LIMITS.admin
          : RATE_LIMITS.api;
    const rl = checkRateLimit(`${scope}:${ip}`, cfg);
    if (!rl.allowed) {
      const res = NextResponse.json(
        { error: "Terlalu banyak permintaan" },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(rl.retryAfterSec));
      return withSecurity(res);
    }
  } else if (!pathname.startsWith("/_next") && !pathname.includes(".")) {
    const pageScope = pathname.startsWith("/admin") ? "admin-page" : "page";
    const pageCfg = pageScope === "admin-page" ? RATE_LIMITS.admin : RATE_LIMITS.page;
    const rl = checkRateLimit(`${pageScope}:${ip}`, pageCfg);
    if (!rl.allowed) {
      return withSecurity(
        new NextResponse("Terlalu banyak permintaan", { status: 429 })
      );
    }
  }

  let response = withSecurity(NextResponse.next({ request }));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = withSecurity(NextResponse.next({ request }));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (pathname.startsWith("/public-report")) {
    return response;
  }

  if (pathname === "/driver/app-entry") {
    return response;
  }

  /** API admin — role + MFA (kecuali endpoint login yang sudah di-rate-limit). */
  if (pathname.startsWith("/api/admin")) {
    const isLoginRoute =
      pathname === "/api/admin/auth/login" && request.method === "POST";

    if (!isLoginRoute) {
      if (!user) {
        return withSecurity(
          NextResponse.json({ error: "Belum login" }, { status: 401 })
        );
      }

      const { data: apiProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (apiProfile?.role !== SUPER_ADMIN_DB_ROLE) {
        return withSecurity(
          NextResponse.json(
            { error: "Akses ditolak — bukan SUPER_ADMIN" },
            { status: 403 }
          )
        );
      }

      const needMfa = await requiresMfaStepUp(supabase);
      if (needMfa) {
        return withSecurity(
          NextResponse.json(
            { error: "Verifikasi MFA diperlukan", code: "MFA_REQUIRED" },
            { status: 403 }
          )
        );
      }
    }

    return response;
  }

  /**
   * SATPAM ADMIN — anti URL interception manual.
   *
   * Customer / Driver yang mengetik `/admin/dashboard` (atau path admin lain)
   * tidak boleh masuk meski sudah login: langsung `/unauthorized`.
   * Hanya `profiles.role === 'admin'` yang boleh melanjutkan (setelah MFA).
   */
  if (pathname.startsWith("/admin")) {
    if (isAdminAuthExempt(pathname)) {
      return forwardPathHeader(request, response);
    }

    if (!user) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("redirect", pathname);
      return withSecurity(NextResponse.redirect(login));
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, account_status, suspended_until")
      .eq("id", user.id)
      .single();

    const adminUserRole = adminProfile?.role as UserRole | undefined;

    if (adminUserRole === "customer" || adminUserRole === "driver") {
      return withSecurity(
        NextResponse.redirect(new URL("/unauthorized", request.url))
      );
    }

    if (adminUserRole !== SUPER_ADMIN_DB_ROLE) {
      return withSecurity(
        NextResponse.redirect(new URL("/unauthorized", request.url))
      );
    }

    const needMfa = await requiresMfaStepUp(supabase);
    if (needMfa) {
      const mfaUrl = new URL("/admin/mfa-challenge", request.url);
      mfaUrl.searchParams.set("redirect", pathname);
      return withSecurity(NextResponse.redirect(mfaUrl));
    }

    return forwardPathHeader(request, response);
  }

  const protectedPrefix = Object.keys(ROLE_ROUTES).find((p) =>
    pathname.startsWith(p)
  );

  if (!protectedPrefix) {
    return response;
  }

  const requiredRole = ROLE_ROUTES[protectedPrefix];

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", pathname);
    return withSecurity(NextResponse.redirect(login));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, account_status, suspended_until")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role as UserRole | undefined;

  if (!userRole || userRole !== requiredRole) {
    if (requiredRole === "driver") {
      const login = new URL("/login", request.url);
      login.searchParams.set("redirect", pathname);
      login.searchParams.set("error", "wrong-role");
      login.searchParams.set("have", userRole ?? "unknown");
      return withSecurity(NextResponse.redirect(login));
    }
    const home = new URL("/", request.url);
    home.searchParams.set("error", "unauthorized");
    home.searchParams.set("need", requiredRole);
    return withSecurity(NextResponse.redirect(home));
  }

  if (
    (requiredRole === "customer" || requiredRole === "merchant") &&
    profile &&
    isAccountAccessBlocked(profile)
  ) {
    const home = new URL("/", request.url);
    home.searchParams.set("notice", "account-restricted");
    home.searchParams.set("status", profile.account_status ?? "suspended");
    return withSecurity(NextResponse.redirect(home));
  }

  if (requiredRole === "driver") {
    const isSetup = pathname.startsWith("/driver/setup");
    const { data: driverRow } = await supabase
      .from("drivers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!driverRow && !isSetup) {
      return withSecurity(NextResponse.redirect(new URL("/driver/setup", request.url)));
    }

    if (driverRow && isSetup) {
      return withSecurity(NextResponse.redirect(new URL("/driver", request.url)));
    }
  }

  if (requiredRole === "merchant") {
    const { data: shop } = await supabase
      .from("merchants")
      .select("id, admin_suspended, approval_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (shop?.admin_suspended) {
      const home = new URL("/", request.url);
      home.searchParams.set("notice", "merchant-suspended");
      return withSecurity(NextResponse.redirect(home));
    }

    const isSetup = pathname.startsWith("/merchant/setup");
    const isPending = pathname.startsWith("/merchant/pending");
    const approval = shop?.approval_status ?? "approved";

    if (!shop && !isSetup) {
      return withSecurity(NextResponse.redirect(new URL("/merchant/setup", request.url)));
    }

    if (shop && isSetup) {
      const dest =
        approval === "approved" ? "/merchant" : "/merchant/pending";
      return withSecurity(NextResponse.redirect(new URL(dest, request.url)));
    }

    if (shop && approval !== "approved" && !isPending) {
      return withSecurity(NextResponse.redirect(new URL("/merchant/pending", request.url)));
    }

    if (shop && approval === "approved" && isPending) {
      return withSecurity(NextResponse.redirect(new URL("/merchant", request.url)));
    }
  }

  return forwardPathHeader(request, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
