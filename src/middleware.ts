import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

/** Route segments that map to dashboard route group */
const DASHBOARD_ROUTES = [
  "/dashboard",
  "/brewery",
  "/stock",
  "/sales",
  "/finance",
  "/plan",
  "/settings",
  "/upgrade",
];

/** Route segments that map to auth route group */
const AUTH_ROUTES = ["/login", "/register"];

/** Route segments that map to admin route group */
const ADMIN_ROUTES = ["/admin"];

function getRouteGroup(
  pathname: string
): "marketing" | "auth" | "dashboard" | "admin" {
  const pathWithoutLocale = pathname.replace(/^\/(cs|en)/, "") || "/";

  if (ADMIN_ROUTES.some((r) => pathWithoutLocale.startsWith(r))) {
    return "admin";
  }
  if (AUTH_ROUTES.some((r) => pathWithoutLocale.startsWith(r))) {
    return "auth";
  }
  if (DASHBOARD_ROUTES.some((r) => pathWithoutLocale.startsWith(r))) {
    return "dashboard";
  }
  return "marketing";
}

function getLocaleFromPath(pathname: string): string {
  const match = pathname.match(/^\/(cs|en)/);
  return match?.[1] ?? routing.defaultLocale;
}

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  // 1. Run next-intl middleware (handles locale detection + redirect)
  const intlResponse = intlMiddleware(request);

  // If intl middleware redirected (e.g. added locale prefix), return that
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return intlResponse;
  }

  // 2. Refresh Supabase session
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const locale = getLocaleFromPath(pathname);
  const routeGroup = getRouteGroup(pathname);

  // 3. Route group protection
  if (routeGroup === "auth" && user) {
    return NextResponse.redirect(
      new URL(`/${locale}/dashboard`, request.url)
    );
  }

  if (routeGroup === "dashboard" && !user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  if (routeGroup === "admin" && !user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // Note: superadmin check for admin routes is done in (admin)/layout.tsx
  // because middleware can't efficiently query the DB for is_superadmin.

  // Note: Module access check (subscription gating) is handled by ModuleGuard
  // in (dashboard)/layout.tsx. Will be added here when subscription data
  // is available in the JWT/session.

  return supabaseResponse;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
