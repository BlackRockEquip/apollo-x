import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — superseded by the PexRecord replacement (see
// schema.prisma's PexRecord comment and pex-stock/[id]/quarantine/route.ts's
// comment for why this file is a dead stub instead of deleted). There is no
// direct get-single-unit route under the new model; notes updates moved to
// PATCH /api/v1/pex/[id]/notes and history to GET /api/v1/pex/[id]/history.
export async function GET() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint was removed with the PexRecord replacement. Use GET /api/v1/pex/[id]/history for a single record's detail." } }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint moved to PATCH /api/v1/pex/[id]/notes." } }, { status: 410 });
}
