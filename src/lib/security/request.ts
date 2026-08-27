import { NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/auth/guards";

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (new URL(origin).origin !== request.nextUrl.origin) throw new AuthorizationError("Cross-origin mutation rejected.");
}

export function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
