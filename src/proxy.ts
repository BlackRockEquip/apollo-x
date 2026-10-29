import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE, demoProxyDecision, isDemoMode } from "@/lib/demo/mode";

// 2026-09-22 — user reports: "Favicon when not logged in must stay as
// Apollo X or the default, must not show any organization logo" and "logos
// not showing on login screen." Signed-out requests to /api/v1/company-settings/favicon
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
// 2026-09-23 — user report: "when trying recover password on login screen,
// after you put your email its throws error: Unexpected token '<',
// \"<!DOCTYPE \"... is not valid JSON." Same root cause as the favicon/
// public-companies case above, a third time: LoginForm's forgot-password
// flow runs while signed out (it's reachable from the login screen itself),
// POSTs to /api/v1/auth/forgot-password, gets redirected to /login before
// the route ever runs (no session cookie yet — that's the whole point of
// the flow), follows the redirect, and response.json() throws on the
// login page's HTML. /api/v1/auth/reset-password (the second step, where
// the emailed link lands) is the same signed-out flow and was missing for
// the same reason, so it's added here too even though it hadn't been
// reported broken yet.
const PUBLIC_PATHS = [
  "/login",
  "/api/v1/auth/login",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/health",
  "/api/v1/company-settings/favicon",
  "/api/v1/public/companies",
  // 2026-10-19: landing page "Request a demo" form (floxintegrations.co.za). Signed-out visitors call it from another website, so it must
  // not be redirected to /login (that also breaks the browser's CORS pre-check). The route itself checks the origin and rate-limits.
  "/api/v1/public/demo-request",
  // Signed, short-lived file links from the "Local folder" storage option
  // (the token itself is the credential, like an S3 presigned URL) — an <img>
  // for a logo on the login page has no session cookie.
  "/api/v1/storage-files",
];

// 2026-10-29: public view-only demo (src/lib/demo/mode.ts, docs/demo-site.md). Only when DEMO_MODE=true, which is set
// on the separate demo service and never on the live app: writes of any kind are refused here, before any route runs,
// and signed-out visitors are signed in through /demo instead of seeing the login screen.
function demoProxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = demoProxyDecision(request.method, pathname, search, request.cookies.has(SESSION_COOKIE));
  let response: NextResponse;
  if (decision.kind === "block-write") {
    response = NextResponse.json({ error: { code: DEMO_READ_ONLY_CODE, message: DEMO_READ_ONLY_MESSAGE } }, { status: 403 });
    response.headers.set("x-demo-read-only", "1");
  } else if (decision.kind === "redirect") {
    response = NextResponse.redirect(new URL(decision.location, request.url));
  } else {
    response = NextResponse.next();
  }
  // Keep the demo out of search results.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  if (isDemoMode()) return demoProxy(request);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/v1/platform/companies/[^/]+/storage-import|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
