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
    expectedOrigin = normalizeOrigin(request.nextUrl.origin);
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
