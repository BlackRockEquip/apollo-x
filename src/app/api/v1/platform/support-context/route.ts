import { NextRequest, NextResponse } from "next/server";
import { SupportAccessMode } from "@prisma/client";
import { z } from "zod";
import { createSession, requireRequestContext, setSessionCookie } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { endSupportAccess, startSupportAccess } from "@/lib/platform/support-service";

const schema = z.object({
  companyId: z.string().cuid(),
  mode: z.nativeEnum(SupportAccessMode),
  reason: z.string().trim().min(10).max(1000),
  durationMinutes: z.number().int().min(5).max(120).default(30),
});

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const context = await requireRequestContext();
    const input = schema.parse(await request.json());
    const support = await startSupportAccess(context, { companyId: input.companyId, mode: input.mode, reason: input.reason, expiresAt: new Date(Date.now() + input.durationMinutes * 60_000) });
    const session = await createSession(context.userId, null, support.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true, destination: "/dashboard" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const context = await requireRequestContext();
    if (!context.supportAccessId) return NextResponse.json({ ok: true, destination: "/platform" });
    await endSupportAccess(context);
    const session = await createSession(context.userId, null, null);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true, destination: "/platform" });
  } catch (error) {
    return apiError(error);
  }
}
