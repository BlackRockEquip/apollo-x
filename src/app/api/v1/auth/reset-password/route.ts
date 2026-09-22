import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { resetPasswordWithToken } from "@/lib/auth/password-reset-service";

const schema = z.object({ token: z.string().min(10), newPassword: z.string().min(8).max(120) });

// 2026-09-22 — public, unauthenticated: the link a "forgot password" email
// sends the user to lands on /reset-password (ResetPasswordForm.tsx),
// which posts here.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = schema.parse(await request.json());
    return NextResponse.json(await resetPasswordWithToken(input.token, input.newPassword));
  } catch (error) {
    return apiError(error);
  }
}
