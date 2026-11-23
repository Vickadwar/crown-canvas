/**
 * @file src/proxy.ts
 * @description Next.js 16 request proxy for Supabase SSR session cookie refresh and
 * enterprise CMS route protection (when NEXT_PUBLIC_REQUIRE_AUTH=true) while keeping
 * /player, /api/player/*, and /q/* permanently public for showroom displays.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PREFIXES = [
  "/player",
  "/api/player",
  "/api/health",
  "/api/auth",
  "/api/integrations",
  "/q/",
  "/login",
  "/setup",
  "/media/",
  "/fonts/",
  "/_next/",
  "/sw.js",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/q" || pathname === "/player") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.next();
  }

  // Never interfere with static assets or player kiosk endpoints
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/media/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/player") ||
    pathname.startsWith("/api/player") ||
    pathname.startsWith("/q/")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

  if (requireAuth && !user && !isPublicPath(pathname)) {
    // Only redirect page routes; let API routes return structured JSON 401
    if (!pathname.startsWith("/api/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      if (pathname !== "/") {
        loginUrl.searchParams.set("next", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  if (requireAuth && user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|media/|fonts/).*)",
  ],
};
