import { NextResponse } from "next/server";

// Removed 2026-09-09 — see ../../[requirementId]/reserve/route.ts's comment.
export async function POST() {
  return NextResponse.json(
    { error: "GONE", message: "Returning stock against a job part allocation was removed. Parts are now tracked via the job's Parts list — see POST /api/v1/jobs/[id]/parts/[lineId]/unreceive." },
    { status: 410 },
  );
}
