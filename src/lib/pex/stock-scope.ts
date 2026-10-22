import type { Prisma } from "@prisma/client";

// 2026-10-22, user request: the dashboard's PEX tile counts "the total units in PEX Stock". This is the one definition of
// "in PEX Stock" (units that have physically come back from a client and are not out on a job yet), shared by the PEX Stock
// page (listPexInventory) and the dashboard so the two always show the same number.
//
// A return job still To be received is hidden (the unit hasn't come back yet) unless the record is a direct "Send to PEX
// Inventory" allocation (no supply job), which may be sent from To be received on purpose.
export function pexStockBaseWhere(companyId: string): Prisma.PexRecordWhereInput {
  return {
    companyId,
    returnJobId: { not: null },
    consumedByJobId: null,
    status: { not: "SCRAPPED" },
    OR: [{ returnJob: { status: { not: "TO_BE_RECEIVED" } } }, { supplyJobId: null }],
  };
}

/** "Ready to go" = the return job is Complete; every other unit in stock is still "To be repaired". */
export const PEX_STOCK_READY_WHERE: Prisma.PexRecordWhereInput = { returnJob: { status: "COMPLETE" } };
