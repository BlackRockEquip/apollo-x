import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getRequestContext } from "@/lib/auth/session";

// 2026-09-22, user report: "Favicon when not logged in must stay as Apollo
// X or the default, must not show any organization logo." The favicon
// ROUTE (api/v1/company-settings/favicon) already falls back correctly
// server-side when there's no session — see that route's own comment —
// but every request used the exact same URL
// ("/api/v1/company-settings/favicon", no query string) no matter who was
// signed in, or whether anyone was signed in at all. Browsers cache
// favicons in their own separate store keyed by that URL, and that cache
// largely ignores Cache-Control (the route already sends no-store, which
// doesn't help here) — so once a tab had ever loaded a company's logo as
// the favicon, the browser kept showing that same icon for that URL
// indefinitely: after logging out, on the login page in the same tab, even
// after switching to a different company. Static `metadata` can't vary
// per request, so this is now `generateMetadata`, reading the same session
// cookie the rest of the app already reads (getRequestContext, which
// returns null rather than throwing when there's no session) and folding
// the signed-in company's id — or "anon" when there isn't one — into the
// icon URL's own query string. Switching identity is now a genuinely
// different URL to the browser, so it can't reuse a stale cached icon.
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getRequestContext();
  return {
    title: { default: "Apollo X", template: "%s | Apollo X" },
    description: "Apollo X operational and commercial platform",
    icons: { icon: `/api/v1/company-settings/favicon?v=${ctx?.companyId ?? "anon"}` },
  };
}

// 2026-09-14 — explicit viewport meta, added as part of the mobile/phone
// pass ("Let other users be able to connect on cellphones, laptops etc" ->
// clarified to "make sure the UI works well on phones"). Without this,
// mobile browsers render the page at desktop width and let the user pinch-
// zoom instead of laying out at the phone's actual width, which would make
// every @media (max-width: ...) rule below moot — a phone's viewport would
// never actually measure as narrow.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
