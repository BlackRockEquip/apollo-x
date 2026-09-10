-- Full replace of Apollo X's PexStockUnit/PexSupplyLink pair with a single
-- PexRecord model matching ModApp's PexRecord field-for-field, per the
-- user's explicit "remove apollo version of pex ... replace entirely like
-- modapp" decision (2026-09-09). See schema.prisma's PexRecord comment for
-- the full behavioral rationale.
--
-- WARNING — DESTRUCTIVE: this drops the "PexSupplyLink" and "PexStockUnit"
-- tables (and their two enums) along with ALL data currently in them —
-- every PEX stock unit and supply/return link on record. Nothing else in
-- the schema has a foreign key pointing INTO either of these two tables
-- (they only ever point outward, to Job/Company/StorageLocation/
-- UserIdentity), so this is safe to drop outright rather than needing a
-- data-migration/backfill step — but if any of that PEX data still matters,
-- export it before running this migration.
--
-- The four new JobActivityType values below are pure additions (no
-- existing column default references them, unlike the P3006 case fixed in
-- 20260909163920_add_status_enum_values/20260909163924_update_major), so
-- they're safe to add in this same migration rather than needing to be
-- split into an earlier one first.

-- DropForeignKey
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_companyId_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_supplyJobId_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_returnJobId_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_pexStockUnitId_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_returnedReceivedById_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_closedWithoutReturnById_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_createdById_fkey";
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT IF EXISTS "PexSupplyLink_updatedById_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_companyId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_sourceJobId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_sourceJobComponentId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_currentSupplyJobId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_currentReturnJobId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_storageLocationId_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_createdById_fkey";
ALTER TABLE "PexStockUnit" DROP CONSTRAINT IF EXISTS "PexStockUnit_updatedById_fkey";

-- DropTable
DROP TABLE IF EXISTS "PexSupplyLink";
DROP TABLE IF EXISTS "PexStockUnit";

-- DropEnum
DROP TYPE IF EXISTS "PexReturnStatus";
DROP TYPE IF EXISTS "PexStockStatus";

-- CreateEnum
CREATE TYPE "PexStatus" AS ENUM ('TO_BE_DELIVERED', 'OUTSTANDING', 'RECEIVED', 'IN_REPAIR', 'COMPLETED', 'SCRAPPED');

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_LINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_UNLINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_UNIT_SCRAPPED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_UNIT_ALLOCATED_TO_INVENTORY';

-- CreateTable
CREATE TABLE "PexRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "unitDescription" TEXT,
    "supplyJobId" TEXT,
    "returnJobId" TEXT,
    "status" "PexStatus" NOT NULL DEFAULT 'TO_BE_DELIVERED',
    "supplyDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "notes" TEXT,
    "consumedByJobId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PexRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PexRecord_id_companyId_key" ON "PexRecord"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PexRecord_supplyJobId_key" ON "PexRecord"("supplyJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PexRecord_returnJobId_key" ON "PexRecord"("returnJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PexRecord_consumedByJobId_key" ON "PexRecord"("consumedByJobId");

-- CreateIndex
CREATE INDEX "PexRecord_companyId_status_idx" ON "PexRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "PexRecord_companyId_customerId_idx" ON "PexRecord"("companyId", "customerId");

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_supplyJobId_fkey" FOREIGN KEY ("supplyJobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_returnJobId_fkey" FOREIGN KEY ("returnJobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_consumedByJobId_fkey" FOREIGN KEY ("consumedByJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexRecord" ADD CONSTRAINT "PexRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
