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

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let actualOrigin: string;
  let expectedOrigin: string;
  try {
    actualOrigin = normalizeOrigin(origin);
    expectedOrigin = normalizeOrigin(request.nextUrl.origin);
  } catch {
    throw new AuthorizationError("Cross-origin mutation rejected.");
  }
  if (actualOrigin !== expectedOrigin) {
    throw new AuthorizationError("Cross-origin mutation rejected.");
  }
}

export function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
