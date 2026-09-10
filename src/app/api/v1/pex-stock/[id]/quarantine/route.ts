import { NextResponse } from "next/server";

// DEPRECATED (2026-09-09) — superseded by the PexRecord replacement of the
// old PexStockUnit/PexSupplyLink model (see schema.prisma's PexRecord
// comment). PexRecord has no location-based quarantine concept; the closest
// equivalent action is scrapping a unit via POST /api/v1/pex/[id]/scrap.
//
// This file is left as a dead stub rather than deleted: this engagement's
// device bridge to the target machine has no shell/delete capability, only
// file read/write, so the file could not be removed from this session.
// Please delete this file (and its siblings — see workshop-track-progress.md
// for the full list of routes made obsolete by the PexRecord replacement)
// the next time you have shell access to the repo.
export async function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "This endpoint was removed with the PexRecord replacement. PEX stock no longer has a quarantine state." } }, { status: 410 });
}
