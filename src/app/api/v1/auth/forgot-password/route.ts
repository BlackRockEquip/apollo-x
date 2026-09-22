import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http/errors";
import { requestIp, publicOriginForLinks, requireSameOrigin } from "@/lib/security/request";
import { requestPasswordReset } from "@/lib/auth/password-reset-service";

const schema = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()) });

// 2026-09-22 — public, unauthenticated: "Add n forgot password to the
// login screen." Always returns the same generic response, whether or not
// the email belongs to an account — see requestPasswordReset's own
// comment for the full reasoning.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = schema.parse(await request.json());
    await requestPasswordReset(input.email, requestIp(request), publicOriginForLinks(request));
    return NextResponse.json({ ok: true, message: "If that email has an account, a reset link has been sent." });
  } catch (error) {
    return apiError(error);
  }
}
