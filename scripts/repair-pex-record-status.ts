// One-off data repair for the "linked return job's real status wasn't
// reflected on its PexRecord" bug fixed in src/lib/pex/service.ts's
// attachReturnJobTx (2026-09-10) — see the progress log entry with the
// same date for the full root-cause writeup. In short: linking an
// ALREADY-EXISTING PEX_RETURN job (via "Link PEX return job", or the
// automatic link when a PEX_SUPPLY job reaches Complete) always hardcoded
// the new PexRecord's status to OUTSTANDING, ignoring whatever real status
// that return job already happened to be sitting at. A return job that had
// already been received and was being worked on by the time it got linked
// would show as "Outstanding" (i.e. still awaited back from the client) on
// the PEX Tracking page — wrong in the misleading direction (looks less
// done than it really is).
//
// This script recomputes every linked PexRecord's status from its return
// job's CURRENT status, using the exact same JOB_STATUS_TO_PEX_STATUS
// mapping the live code now uses (imported, not copied, so it can't drift).
// It is read-only by default — pass --apply to actually write changes.
//
// Run with:
//   npx tsx scripts/repair-pex-record-status.ts          (dry run — prints what WOULD change)
//   npx tsx scripts/repair-pex-record-status.ts --apply   (writes the corrections)
import { JobStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { JOB_STATUS_TO_PEX_STATUS } from "../src/lib/pex/service";

const APPLY = process.argv.includes("--apply");

async function main() {
  const records = await prisma.pexRecord.findMany({
    where: {
      returnJobId: { not: null },
      // SCRAPPED is a deliberate terminal state set by the separate "Scrap
      // unit" action, unrelated to the linked job's own status — must never
      // be overwritten by this repair.
      status: { not: "SCRAPPED" },
    },
    include: {
      returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } },
      supplyJob: { select: { id: true, jobNumber: true, draftNumber: true } },
    },
  });

  let changed = 0;
  let skippedUnmapped = 0;

  for (const record of records) {
    if (!record.returnJob) continue; // shouldn't happen given returnJobId isn't null, but keeps TS happy
    const mapped = JOB_STATUS_TO_PEX_STATUS[record.returnJob.status as JobStatus];
    if (!mapped) {
      // Same "no mapping = leave it exactly as it was" rule
      // syncPexStatusFromJobStatus follows — e.g. the return job is
      // currently DRAFT/CANCELLED/RETURNED_UNREPAIRED, which a PEX record's
      // status has nothing sensible to say about.
      skippedUnmapped++;
      continue;
    }
    if (mapped === record.status) continue; // already correct

    const returnJobLabel = record.returnJob.jobNumber ?? record.returnJob.draftNumber ?? record.returnJob.id;
    const supplyJobLabel = record.supplyJob ? (record.supplyJob.jobNumber ?? record.supplyJob.draftNumber ?? record.supplyJob.id) : "(none)";
    console.log(
      `${APPLY ? "Fixing" : "Would fix"}: PexRecord ${record.id} (return job ${returnJobLabel}, supply job ${supplyJobLabel}) ` +
        `status ${record.status} -> ${mapped} (return job's own status is ${record.returnJob.status})`
    );
    changed++;

    if (APPLY) {
      // Same "first time it moves off OUTSTANDING is the moment it actually
      // came back" rule attachReturnJobTx/syncPexStatusFromJobStatus use —
      // backfill returnDate too if it's still blank and the corrected
      // status says the unit is already back.
      const returnDate = record.returnDate ?? (mapped !== "OUTSTANDING" ? new Date() : null);
      await prisma.pexRecord.update({
        where: { id: record.id },
        data: { status: mapped, returnDate },
      });
    }
  }

  console.log("");
  console.log(`Checked ${records.length} linked PEX record(s) (excluding SCRAPPED).`);
  console.log(`${changed} ${APPLY ? "corrected" : "would be corrected"}.`);
  if (skippedUnmapped > 0) {
    console.log(`${skippedUnmapped} skipped — linked return job's own status has no PEX-status mapping (e.g. draft, cancelled, returned unrepaired).`);
  }
  if (!APPLY && changed > 0) {
    console.log("");
    console.log("This was a dry run — nothing was written. Re-run with --apply to write these corrections.");
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
