import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

// 2026-09-15 — /api/v1/integrations/excel-sync added here. It's a
// machine-to-machine endpoint (scripts/excel-sync-bridge.ts pushing the WIP
// workbook from the user's own PC), so it never carries a browser session
// cookie and was being caught by the "no session -> redirect to /login"
// rule below before it ever reached the route handler — the bridge script
// saw this as "HTTP 200 but not JSON" (the /login page's HTML), since
// fetch() follows a redirect automatically. The route itself already does
// its own authentication (a constant-time comparison against
// EXCEL_SYNC_API_KEY — see that route's own header comment); exempting it
// here just lets that check run instead of never being reached, the same
// way /api/v1/auth/login is exempted so a session can be created in the
// first place.
const PUBLIC_PATHS = ["/login", "/api/v1/auth/login", "/api/v1/health", "/api/v1/integrations/excel-sync"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
