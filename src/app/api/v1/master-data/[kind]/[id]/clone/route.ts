import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { clonePartyToOtherKind } from "@/lib/master-data/service";

// 2026-10-22, user request: clone a supplier to a customer (or a customer to a supplier). See clonePartyToOtherKind.
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const p = await params;
    return NextResponse.json(await clonePartyToOtherKind(ctx, p.kind, p.id), { status: 201 });
  } catch (error) { return apiError(error); }
}
