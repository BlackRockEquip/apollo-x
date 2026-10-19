import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requestIp } from "@/lib/security/request";
import { apiError } from "@/lib/http/errors";
import { demoRequestSchema, isAllowedOrigin, isDemoRequestThrottled, receiveDemoRequest, DEFAULT_DEMO_RECIPIENT } from "@/lib/public/demo-request-service";

// Public endpoint for the landing page's "Request a demo" form (see src/lib/public/demo-request-service.ts).
// It is the only route that is callable without signing in and from another website, so it checks the Origin header
// against the landing page's own addresses, answers the browser's CORS pre-check, and rate-limits.

function corsHeaders(origin: string | null): Record<string, string> {
  return origin && isAllowedOrigin(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
    : { Vary: "Origin" };
}

const json = (body: unknown, status: number, origin: string | null) => NextResponse.json(body, { status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } });

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: isAllowedOrigin(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    // A browser always sends Origin on a cross-site POST. A request with a different Origin is refused outright;
    // one with no Origin (a script, not a browser) is still limited by the rate limits below.
    if (origin && !isAllowedOrigin(origin)) return json({ error: { code: "FORBIDDEN", message: "This request is not allowed from that website." } }, 403, null);

    const raw = await request.text();
    if (raw.length > 12_000) return json({ error: { code: "VALIDATION_ERROR", message: "The request is too large." } }, 413, origin);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: { code: "VALIDATION_ERROR", message: "The request is invalid." } }, 400, origin); }

    const input = demoRequestSchema.parse(body);
    // Real visitors never see the hidden field. A bot that fills it gets a normal "ok" and nothing is sent.
    if (input.botcheck) return json({ ok: true }, 200, origin);

    if (await isDemoRequestThrottled(requestIp(request), input.email)) {
      return json({ error: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." } }, 429, origin);
    }

    // Saved for the Demo Requests screen and emailed. If neither worked, say so; if at least one did, the request is not lost.
    const { saved, emailed } = await receiveDemoRequest(input);
    if (!saved && !emailed) {
      return json({ error: { code: "EMAIL_UNAVAILABLE", message: `We could not send your request just now. Please email ${DEFAULT_DEMO_RECIPIENT} directly.` } }, 503, origin);
    }
    return json({ ok: true }, 200, origin);
  } catch (error) {
    if (error instanceof ZodError) return json({ error: { code: "VALIDATION_ERROR", message: "Please check your name and email address." } }, 400, origin);
    return apiError(error);
  }
}
