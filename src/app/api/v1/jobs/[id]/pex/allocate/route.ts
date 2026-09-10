import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { allocateJobToPexInventory } from "@/lib/pex/service";

// "Send job to PEX Inventory" — any completed job's unit, of any job type,
// can be allocated directly into PEX Inventory (a PexRecord with only
// returnJobId set, status COMPLETED) without a supply/return chain. Mirrors
// ModApp's allocateJobToPexInventory action. Replaces the old, PEX-specific
// jobs/[id]/pex-transfer route.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await allocateJobToPexInventory(await requireRequestContext(), id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
