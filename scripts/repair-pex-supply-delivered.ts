// One-off data repair for PEX Supply records stuck on "To be delivered"
// after their job was moved to Delivered awaiting payment (e.g. BRE1135)
// without a Delivery date being filled in. The live code
// (src/lib/pex/service.ts, pexSupplyDeliveredStatus) now treats a supply job
// as delivered when it has a Delivery date OR its status is Delivered
// awaiting payment / Complete / Closed, but that rule only runs when a job is
// next saved or has its status changed — this script fixes records that are
// already wrong.
//
// Unlinked, non-scrapped PEX Supply records only (once a return job is
// linked, its own status drives the PEX status).
//
// Run with:
//   npx tsx scripts/repair-pex-supply-delivered.ts          (dry run)
//   npx tsx scripts/repair-pex-supply-delivered.ts --apply  (writes the corrections)
import { prisma } from "../src/lib/prisma";
import { pexSupplyDeliveredStatus } from "../src/lib/pex/service";

const APPLY = process.argv.includes("--apply");

async function main() {
  const records = await prisma.pexRecord.findMany({
    where: { supplyJobId: { not: null }, returnJobId: null, status: { in: ["TO_BE_DELIVERED", "AWAIT_CORE"] } },
    include: { supplyJob: { select: { jobNumber: true, draftNumber: true, status: true, deliveryDate: true } } },
  });
  let changed = 0;
  for (const record of records) {
    if (!record.supplyJob) continue;
    const desired = pexSupplyDeliveredStatus(record.supplyJob);
    if (desired === record.status) continue;
    console.log(`${APPLY ? "Fixing" : "Would fix"}: ${record.supplyJob.jobNumber ?? record.supplyJob.draftNumber} (job status ${record.supplyJob.status}) ${record.status} -> ${desired}`);
    changed++;
    if (APPLY) await prisma.pexRecord.update({ where: { id: record.id }, data: { status: desired } });
  }
  console.log(`\nChecked ${records.length} unlinked PEX supply record(s); ${changed} ${APPLY ? "corrected" : "would be corrected"}.`);
  if (!APPLY && changed > 0) console.log("Dry run — re-run with --apply to write these corrections.");
}

main().finally(async () => {
  await prisma.$disconnect();
});
