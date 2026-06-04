import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/types/database";

const ROLE_ROUTES: Record<string, UserRole> = {
  "/admin": "admin",
  "/merchant": "merchant",
  "/customer": "customer",
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/public-report")) {
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
    return NextResponse.redirect(login);
  }

  // Profile row missing → treat as unauthorized (trigger may not have run)

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = profile?.role as UserRole | undefined;

  if (!userRole || userRole !== requiredRole) {
    const home = new URL("/", request.url);
    home.searchParams.set("error", "unauthorized");
    home.searchParams.set("need", requiredRole);
    return NextResponse.redirect(home);
  }

  // Merchant wajib punya data toko sebelum dashboard
  if (requiredRole === "merchant") {
    const { data: shop } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    const isSetup = pathname.startsWith("/merchant/setup");

    if (!shop && !isSetup) {
      return NextResponse.redirect(new URL("/merchant/setup", request.url));
    }

    if (shop && isSetup) {
      return NextResponse.redirect(new URL("/merchant", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/merchant",
    "/merchant/:path*",
    "/customer",
    "/customer/:path*",
    "/login",
  ],
};
