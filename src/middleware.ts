import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/types/database";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/enforce";
import { scanPathname, scanSearchParams } from "@/lib/security/sql-guard";
import { isAccountAccessBlocked } from "@/lib/account-status";
import { DRIVER_CLOSED_MESSAGE, isDriverAppEnabled } from "@/lib/feature-flags";

const ROLE_ROUTES: Record<string, UserRole> = {
  "/admin": "admin",
  "/merchant": "merchant",
  "/customer": "customer",
  "/driver": "driver",
};

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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);
  const isApi = pathname.startsWith("/api");

  if (scanPathname(pathname) || scanSearchParams(request.nextUrl.searchParams)) {
    return blockedRequestResponse(isApi);
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
      .select("id, admin_suspended")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (shop?.admin_suspended) {
      const home = new URL("/", request.url);
      home.searchParams.set("notice", "merchant-suspended");
      return withSecurity(NextResponse.redirect(home));
    }

    const isSetup = pathname.startsWith("/merchant/setup");

    if (!shop && !isSetup) {
      return withSecurity(NextResponse.redirect(new URL("/merchant/setup", request.url)));
    }

    if (shop && isSetup) {
      return withSecurity(NextResponse.redirect(new URL("/merchant", request.url)));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
