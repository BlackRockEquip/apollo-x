import { NextResponse } from "next/server";

// Removed 2026-09-09 — the reserve/issue/return "Parts required" workflow
// was replaced by the simpler Parts list (JobPartLine; see
// schema.prisma's JobPartLine comment and src/lib/jobs/service.ts's Parts
// list section). This file is left in place as a stub (this session's
// device bridge has no way to delete files) rather than removed outright.
// Receiving a part line now happens via POST
// /api/v1/jobs/[id]/parts/[lineId]/receive instead.
export async function POST() {
  return NextResponse.json(
    { error: "GONE", message: "Reserving stock against a job part requirement was removed. Parts are now tracked via the job's Parts list — see POST /api/v1/jobs/[id]/parts/[lineId]/receive." },
    { status: 410 },
  );
}
