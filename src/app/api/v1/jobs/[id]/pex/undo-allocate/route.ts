import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { undoAllocateJobToPexInventory } from "@/lib/pex/service";

// 2026-10-05 — user request: undo for "Send to PEX Inventory". Counterpart
// to ../allocate/route.ts.
export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await undoAllocateJobToPexInventory(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
