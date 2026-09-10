import { NextResponse } from "next/server";

// Removed 2026-09-09 — see ../../[requirementId]/reserve/route.ts's comment.
export async function POST() {
  return NextResponse.json(
    { error: "GONE", message: "Releasing a job part allocation reservation was removed. Parts are now tracked via the job's Parts list — see POST /api/v1/jobs/[id]/parts/[lineId]/receive." },
    { status: 410 },
  );
}
