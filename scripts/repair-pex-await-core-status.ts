// One-off data repair for the "PEX Supply job delivered but its PexRecord
// still says To be delivered" bug fixed in src/lib/pex/service.ts
// (2026-09-10) — at the user's direct request: "when a pex supply has a
// delivery date its status says to be delivered still, this needs to
// change to await core." In short: a PEX Supply job's delivery date is a
// plain form field, independent of the job's own status stepper, so it
// could be set without any job-status change or job-save touching the
// PexRecord's status at all — the live sync hooks (syncPexStatusFromJobStatus,
// syncPexAwaitCoreFromDeliveryDate) only run on a job create/save/status
// change going forward. Any PexRecord that was already sitting on
// TO_BE_DELIVERED, with its supply job already carrying a delivery date,
// from BEFORE this fix shipped needs a one-off correction to actually show
// AWAIT_CORE.
//
// This script finds every such record and, going the other direction too,
// every AWAIT_CORE record whose supply job's delivery date has since been
// cleared (should read TO_BE_DELIVERED instead) — using the exact same
// rule the live code now applies (deliveryDate set -> AWAIT_CORE, else
// TO_BE_DELIVERED). Only unlinked records (no return job yet) are in
// scope — once linked, a record's status comes from the return job's own
// progress instead (see JOB_STATUS_TO_PEX_STATUS / attachReturnJobTx, and
// the separate repair-pex-record-status.ts for that bug). SCRAPPED is left
// alone, same as the live code. It is read-only by default — pass --apply
// to actually write changes.
//
// Run with:
//   npx tsx scripts/repair-pex-await-core-status.ts          (dry run — prints what WOULD change)
//   npx tsx scripts/repair-pex-await-core-status.ts --apply   (writes the corrections)
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const records = await prisma.pexRecord.findMany({
    where: {
      supplyJobId: { not: null },
      returnJobId: null,
      status: { in: ["TO_BE_DELIVERED", "AWAIT_CORE"] },
    },
    include: {
      supplyJob: { select: { id: true, jobNumber: true, draftNumber: true, deliveryDate: true } },
    },
  });

  let changed = 0;

  for (const record of records) {
    if (!record.supplyJob) continue; // shouldn't happen given supplyJobId isn't null, but keeps TS happy
    const desired = record.supplyJob.deliveryDate ? "AWAIT_CORE" : "TO_BE_DELIVERED";
    if (desired === record.status) continue; // already correct

    const supplyJobLabel = record.supplyJob.jobNumber ?? record.supplyJob.draftNumber ?? record.supplyJob.id;
    console.log(
      `${APPLY ? "Fixing" : "Would fix"}: PexRecord ${record.id} (supply job ${supplyJobLabel}) ` +
        `status ${record.status} -> ${desired} (supply job's delivery date is ${record.supplyJob.deliveryDate ? record.supplyJob.deliveryDate.toISOString().slice(0, 10) : "not set"})`
    );
    changed++;

    if (APPLY) {
      await prisma.pexRecord.update({
        where: { id: record.id },
        data: { status: desired },
      });
    }
  }

  console.log("");
  console.log(`Checked ${records.length} unlinked PEX record(s) currently on To be delivered or Awaiting core.`);
  console.log(`${changed} ${APPLY ? "corrected" : "would be corrected"}.`);
  if (!APPLY && changed > 0) {
    console.log("");
    console.log("This was a dry run — nothing was written. Re-run with --apply to write these corrections.");
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
