import { describe, it } from "vitest";

// 2026-09-14 — STALE TEST FILE, safe to delete (couldn't delete it
// directly — this session has no file-delete capability on this machine,
// only read/write, so it's neutralized here instead; please remove this
// file by hand).
//
// This file tested the old PexStockUnit/PexSupplyLink pair — imported
// cancelPexSupplyLink/closePexReturnWithoutCore/
// getPexSupplyLinkBySupplyJobId/linkPexSupplyJob/listPexStockUnits/
// listPexSupplyLinks/quarantinePexStockUnit/receivePexReturn/
// relinkPexSupplyChain/releasePexStockUnit/scrapPexStockUnit/
// transferCompletedRepairToPexStock from pex/service.ts (none exist), and
// queried a `db.pexStockUnit` Prisma model (doesn't exist).
//
// That whole model was fully replaced 2026-09-09, at the user's explicit
// request ("remove apollo version of pex ... replace entirely like
// modapp") with the single `PexRecord` model matching ModApp's own design
// (see the dated schema comment in prisma/schema.prisma). The real current
// equivalents, in pex/service.ts:
//   linkPexSupplyJob/getPexSupplyLinkBySupplyJobId/relinkPexSupplyChain/
//   cancelPexSupplyLink -> linkPexReturnJob / unlinkPexReturnJob /
//                           createPexReturnJob
//   listPexStockUnits/listPexSupplyLinks -> listPexInventory / listPexTracking
//   scrapPexStockUnit -> scrapPexRecord
//   transferCompletedRepairToPexStock -> allocateJobToPexInventory
//   quarantinePexStockUnit/releasePexStockUnit -> no equivalent, deliberately
//                           dropped (dead PEX_STOCK_QUARANTINE permission)
//   receivePexReturn/closePexReturnWithoutCore -> no equivalent; receiving
//                           is now automatic via the job's own status
//                           stepper (syncPexStatusFromJobStatus) and there's
//                           no "close without a core" action in the new
//                           model at all (see the two dead routes removed
//                           the same day this file was stubbed:
//                           pex-tracking/supply/[jobId]/receive and
//                           .../close-without-return)
// A fresh test file for PexRecord (if wanted) should be written against
// that real API, not adapted from this one — the data model itself
// changed, not just function names.
describe.skip("phase4b-step2-pex (removed: PexStockUnit/PexSupplyLink model, 2026-09-09)", () => {
  it("superseded by PexRecord — see file header comment", () => {});
});
