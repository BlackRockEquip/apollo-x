import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createPickSlipForJob } from "@/lib/inventory/service";

// 2026-09-16 — "Create picking slip" button on the Job's own Parts list
// section. See createPickSlipForJob's own comment for how this differs
// from Stock Levels' POST /api/v1/inventory/pick-slips.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await createPickSlipForJob(await requireRequestContext(), id), { status: 201 });
  } catch (e) { return apiError(e); }
}
