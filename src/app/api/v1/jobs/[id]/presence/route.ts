import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { heartbeatJobPresence, leaveJobPresence } from "@/lib/jobs/presence";

// POST = "I have this job open" (returns everyone who does), DELETE = "I left".
export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await heartbeatJobPresence(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await leaveJobPresence(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
