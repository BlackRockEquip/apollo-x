import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — moved to POST /api/v1/pex/[id]/scrap under the
// PexRecord replacement (see schema.prisma's PexRecord comment and
// pex-stock/[id]/quarantine/route.ts's comment for why this file is a dead
// stub instead of deleted). The id shape also changed: it now addresses a
// PexRecord, not a PexStockUnit.
export async function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint moved to POST /api/v1/pex/[id]/scrap." } }, { status: 410 });
}
