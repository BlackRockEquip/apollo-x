import { NextRequest, NextResponse } from "next/server";
import { SupportAccessMode } from "@prisma/client";
import { z } from "zod";
import { createSession, requireRequestContext, setSessionCookie } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { startSupportAccessFromTicket } from "@/lib/support/service";

const schema = z.object({ mode: z.nativeEnum(SupportAccessMode) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const input = schema.parse(await request.json());
    const support = await startSupportAccessFromTicket(ctx, (await params).id, input.mode);
    const session = await createSession(ctx.userId, null, support.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true, destination: "/dashboard" });
  } catch (error) {
    return apiError(error);
  }
}