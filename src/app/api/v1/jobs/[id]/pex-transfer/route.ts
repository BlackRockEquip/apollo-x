import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — superseded by the PexRecord replacement (see
// schema.prisma's PexRecord comment and pex-stock/[id]/quarantine/route.ts's
// comment for why this file is a dead stub instead of deleted). The
// per-component "transfer to PEX Stock" workflow is gone; the closest
// equivalent is POST /api/v1/jobs/[id]/pex/allocate, which sends the whole
// completed job's unit straight to PEX Inventory.
export async function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint moved to POST /api/v1/jobs/[id]/pex/allocate." } }, { status: 410 });
}
