import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { countApprove } from "@/lib/inventory/service";

// 2026-10-02 — new Stock Take tab (user request). countApprove already
// existed in inventory/service.ts (it's part of the original Reconciliation
// feature set) but had no route — only POST [id] (complete) was wired.
// Same POST-only, no-body shape as [id]/route.ts; approve just flips a
// COMPLETED count to APPROVED, no input needed.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await countApprove(await requireRequestContext(), (await params).id));
  } catch (e) { return apiError(e); }
}
