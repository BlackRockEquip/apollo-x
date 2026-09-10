import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — superseded by the PexRecord replacement (see
// schema.prisma's PexRecord comment and pex-stock/[id]/quarantine/route.ts's
// comment for why this file is a dead stub instead of deleted). There is no
// "release from quarantine" concept under PexRecord.
export async function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint was removed with the PexRecord replacement." } }, { status: 410 });
}
