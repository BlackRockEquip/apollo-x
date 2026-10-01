import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { undoJobReturnedUnrepaired } from "@/lib/jobs/service";

// 2026-10-01 — user request: "Mark return unrepaired button, allow to undo
// once clicked." Counterpart to ../route.ts (markJobReturnedUnrepaired).
export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await undoJobReturnedUnrepaired(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
