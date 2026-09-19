import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { resolveCompanyLogoSource } from "@/lib/master-data/company-settings-service";

// 2026-09-15, user request: "Apollo x favicon icon on web browser to be the
// company logo of the organization else reverts back to ApolloX 'AX'."
// Wired up as the site's <link rel="icon"> target (see the root layout's
// metadata.icons) rather than a static app/favicon.ico or app/icon.tsx —
// this needs to be genuinely dynamic per signed-in company, and a plain
// route handler lets it reuse the exact same lookup the existing
// ../logo/route.ts GET already does instead of re-deriving it.
//
// 2026-09-19 — user report: "investigate logo display problem throughout
// the app." This route was still calling the old getCompanySettings
// directly, gated behind COMPANY_SETTINGS_VIEW (admin-only) — the exact
// permission-scoping bug already fixed on ../logo/route.ts earlier this
// session, just never applied here too. A user without that separate
// admin permission got a thrown 403 on every page load, silently caught
// below and shown the "AX" fallback forever, even with a real logo set.
// Switched to resolveCompanyLogoSource — see its own comment for the
// second bug it also fixes (pre-object-storage-migration logos with no
// Attachment row).
//
// No caching here (Cache-Control: no-store) on purpose: the URL is the
// same for every company ("/api/v1/company-settings/favicon", not
// per-company), so if the browser cached it aggressively, a shared/kiosk
// browser signing into a second company afterward could keep showing the
// first company's logo as its tab icon. A favicon request is infrequent
// (once per tab, not per navigation), so re-checking each time is cheap.
const AX_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Apollo X"><rect width="32" height="32" rx="7" fill="#172033"/><text x="16" y="21.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="0.5" fill="#d6a83b">AX</text></svg>`;

function axFallback() {
  return new NextResponse(AX_FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const source = await resolveCompanyLogoSource(ctx);
    if (source.kind === "redirect") return NextResponse.redirect(new URL(source.url, request.url), { headers: { "cache-control": "no-store" } });
    if (source.kind === "inline") return new NextResponse(source.data, { headers: { "content-type": source.mimeType, "cache-control": "no-store" } });
  } catch {
    // Not signed in yet (login page), no company context (platform-admin
    // area), or the lookup failed for some other reason — fall through to
    // the built-in "AX" favicon below rather than a broken tab icon.
  }
  return axFallback();
}
