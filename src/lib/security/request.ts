import { NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/auth/guards";

function isLoopbackHostname(value: string) {
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  const hostname = isLoopbackHostname(url.hostname) ? "loopback" : url.hostname;
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.protocol}//${hostname}:${port}`;
}

// 2026-09-14 (first Render deploy) — request.nextUrl.origin reflects what
// Next.js itself was connected to, not what the browser actually used.
// Render (like effectively every PaaS/reverse proxy) terminates TLS at its
// edge and forwards to this app over plain HTTP internally, so
// request.nextUrl.protocol reports "http:" even for a real
// "https://apollox-staging.onrender.com" request — a guaranteed mismatch
// against the browser's Origin header on EVERY mutation, not something
// specific to any one device or browser. This never showed up before
// because this app had only ever run directly (next dev / next start on
// the user's own PC), with no proxy in front of it at all. The fix: trust
// x-forwarded-proto/x-forwarded-host when present, same as Next.js's own
// built-in Server Actions origin check does (see
// https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions#allowedorigins)
// — safe here because Render's router is the only thing that can reach
// this app's internal port; a client can't forge these by hitting the app
// directly the way it could if the app were exposed without a proxy.
function publicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  const host = forwardedHost || request.nextUrl.host;
  return normalizeOrigin(`${protocol}://${host}`);
}

// 2026-09-14 — a teammate on the workshop LAN could load pages fine after
// next.config.ts's allowedDevOrigins fix, but every mutation (add a user,
// add an RFQ, etc.) still failed with "Cross-origin mutation rejected.".
// That's because allowedDevOrigins only covers Next.js's OWN dev-asset
// loading guard (GETs for pages/HMR) — this requireSameOrigin function
// below is separate, app-level CSRF protection that runs on every mutating
// API call, and it was never updated for the LAN case. Same subnet, same
// reasoning: in development only, also accept a mutation whose Origin
// header names a host on the trusted workshop /24 — never in production,
// where only an exact origin match is accepted.
const DEV_TRUSTED_ORIGIN_HOSTNAME = process.env.NODE_ENV !== "production" ? /^192\.168\.101\.\d{1,3}$/ : null;

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originUrl: URL;
  let expectedOrigin: string;
  try {
    originUrl = new URL(origin);
    expectedOrigin = publicOrigin(request);
  } catch {
    throw new AuthorizationError("Cross-origin mutation rejected.");
  }
  const actualOrigin = normalizeOrigin(origin);
  if (actualOrigin === expectedOrigin) return;
  if (DEV_TRUSTED_ORIGIN_HOSTNAME && DEV_TRUSTED_ORIGIN_HOSTNAME.test(originUrl.hostname)) return;
  throw new AuthorizationError("Cross-origin mutation rejected.");
}

export function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

// 2026-09-22 — added so the forgot-password email (auth/password-reset-
// service.ts) can build a correct absolute reset link. Same
// x-forwarded-proto/x-forwarded-host trust as publicOrigin() above (same
// Render-proxy reasoning — request.nextUrl.origin would report "http://"
// even on a real https:// deploy), but returns a clean, human-facing
// "protocol://host" with no forced :443/:80 suffix — publicOrigin()'s own
// port-normalization exists only to make same-origin equality comparisons
// exact, which isn't a concern for a link a person will actually click.
export function publicOriginForLinks(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  const host = forwardedHost || request.nextUrl.host;
  return `${protocol}://${host}`;
}
