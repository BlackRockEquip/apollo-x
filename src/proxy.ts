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
//
// 2026-09-22 — user reports: "Favicon when not logged in must stay as
// Apollo X or the default, must not show any organization logo" and "logos
// not showing on login screen." Same root cause as the excel-sync case
// above, just discovered a second time: /api/v1/company-settings/favicon
// and /api/v1/public/companies (+ its nested .../[id]/logo route) were
// both written to be safely callable while signed out — the favicon route
// already falls back to the "AX" SVG in a try/catch, and the public
// companies routes take no session at all — but neither path was listed
// here, so every logged-out request to either one was being redirected to
// /login before it ever reached that code. For the favicon: the browser
// requests an icon, gets back the /login page's HTML instead of an image,
// can't use it as a favicon, and the tab is left showing whatever it had
// cached before (often a previously-loaded company logo from an earlier
// signed-in session) — hence "still shows an organization logo" even
// though the route itself would have served the neutral AX icon if it had
// ever been allowed to run. For the companies strip: PlatformCompaniesStrip
// fetches /api/v1/public/companies from the (signed-out) login page,
// follows the redirect to /login's own HTML (a 200, so response.ok is
// true), then response.json() throws on that HTML and is swallowed by the
// component's .catch(() => {}) — so the list silently stays empty and the
// whole strip renders nothing. Listing /api/v1/public/companies here (with
// the existing startsWith(`${path}/`) prefix match) also covers the nested
// /api/v1/public/companies/[id]/logo route the strip's <img> tags hit.
const PUBLIC_PATHS = [
  "/login",
  "/api/v1/auth/login",
  "/api/v1/health",
  "/api/v1/integrations/excel-sync",
  "/api/v1/company-settings/favicon",
  "/api/v1/public/companies",
];

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
