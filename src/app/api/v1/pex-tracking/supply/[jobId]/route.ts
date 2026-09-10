import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — superseded by the PexRecord replacement (see
// schema.prisma's PexRecord comment and
// pex-stock/[id]/quarantine/route.ts's comment for why this file is a dead
// stub instead of deleted). The supply-job-scoped PEX linking actions moved
// under /api/v1/jobs/[id]/pex/*:
//   POST   /api/v1/jobs/[id]/pex/create-return  — create a linked return job
//   POST   /api/v1/jobs/[id]/pex/link-return     — link an existing return job
//   DELETE /api/v1/jobs/[id]/pex/link-return     — unlink the return job
// There is no GET or PATCH equivalent — a job's PexRecord travels with the
// job detail response (pexAsSupply/pexAsReturn/pexConsumedBy) and there is
// no "relink chain" correction workflow under the new model.
export async function GET() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint was removed with the PexRecord replacement. PEX linkage now travels with the job detail response." } }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint moved to POST /api/v1/jobs/[id]/pex/create-return or /link-return." } }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint was removed with the PexRecord replacement. There is no relink/correction workflow under the new model." } }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint moved to DELETE /api/v1/jobs/[id]/pex/link-return." } }, { status: 410 });
}
