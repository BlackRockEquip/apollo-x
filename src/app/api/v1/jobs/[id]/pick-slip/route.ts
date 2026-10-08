import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createPickSlipForJob, previewPickSlipForJob } from "@/lib/inventory/service";

// 2026-09-16 — "Create picking slip" button on the Job's own Parts list
// section. See createPickSlipForJob's own comment for how this differs
// from Stock Levels' POST /api/v1/inventory/pick-slips.
//
// 2026-10-08 — GET answers "which parts would be held back by other jobs'
// reservations?" so the button can show its override window before anything
// is created; POST takes the lines the person chose to override.
const pickSlipInput = z.object({ overrideLineIds: z.array(z.string().min(1)).max(500).optional() });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await previewPickSlipForJob(await requireRequestContext(), id));
  } catch (e) { return apiError(e); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = pickSlipInput.parse(body ?? {});
    return NextResponse.json(await createPickSlipForJob(await requireRequestContext(), id, { overrideLineIds: input.overrideLineIds }), { status: 201 });
  } catch (e) { return apiError(e); }
}
