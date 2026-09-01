-- CreateEnum
CREATE TYPE "JobPartAllocationMovementKind" AS ENUM ('ISSUE', 'RETURN');

-- CreateEnum
CREATE TYPE "JobPartReturnDisposition" AS ENUM ('UNUSED_SURPLUS', 'REQUIREMENT_REMAINS');

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_issueMovementId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_returnMovementId_fkey";

-- AlterTable
ALTER TABLE "JobPartAllocation"
DROP COLUMN "issueMovementId",
DROP COLUMN "quantityIssued",
DROP COLUMN "quantityReturned",
DROP COLUMN "returnMovementId",
ADD COLUMN "locationId" TEXT NOT NULL,
ADD COLUMN "partId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "JobPartAllocationMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "kind" "JobPartAllocationMovementKind" NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "returnDisposition" "JobPartReturnDisposition",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPartAllocationMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPartAllocationMovement_companyId_allocationId_idx" ON "JobPartAllocationMovement"("companyId", "allocationId");

-- CreateIndex
CREATE INDEX "JobPartAllocationMovement_companyId_stockMovementId_idx" ON "JobPartAllocationMovement"("companyId", "stockMovementId");

-- CreateIndex
CREATE INDEX "JobPartAllocationMovement_companyId_kind_idx" ON "JobPartAllocationMovement"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "JobPartAllocationMovement_allocationId_stockMovementId_kind_key" ON "JobPartAllocationMovement"("allocationId", "stockMovementId", "kind");

-- CreateIndex
CREATE INDEX "JobPartAllocation_companyId_partId_idx" ON "JobPartAllocation"("companyId", "partId");

-- CreateIndex
CREATE INDEX "JobPartAllocation_companyId_locationId_idx" ON "JobPartAllocation"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPartAllocation_requirementId_locationId_stockReservation_key" ON "JobPartAllocation"("requirementId", "locationId", "stockReservationId");

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocationMovement" ADD CONSTRAINT "JobPartAllocationMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocationMovement" ADD CONSTRAINT "JobPartAllocationMovement_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "JobPartAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocationMovement" ADD CONSTRAINT "JobPartAllocationMovement_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- PHASE 4A STEP 3A TENANT / LINEAGE INTEGRITY
-- Preserve strong tenant-qualified lineage using composite keys/FKs
-- where Prisma cannot cleanly model them without weakening integrity.
-- ============================================================

-- Composite identifiers needed for tenant-qualified lineage
CREATE UNIQUE INDEX "Job_id_companyId_key" ON "Job"("id", "companyId");
CREATE UNIQUE INDEX "JobPartRequirement_id_companyId_key" ON "JobPartRequirement"("id", "companyId");
CREATE UNIQUE INDEX "JobPartRequirement_id_companyId_jobId_partId_key" ON "JobPartRequirement"("id", "companyId", "jobId", "partId");
CREATE UNIQUE INDEX "Part_id_companyId_key" ON "Part"("id", "companyId");
CREATE UNIQUE INDEX "StorageLocation_id_companyId_key" ON "StorageLocation"("id", "companyId");
CREATE UNIQUE INDEX "StockReservation_id_companyId_key" ON "StockReservation"("id", "companyId");
CREATE UNIQUE INDEX "StockMovement_id_companyId_key" ON "StockMovement"("id", "companyId");
CREATE UNIQUE INDEX "StockReservation_id_companyId_partId_locationId_key" ON "StockReservation"("id", "companyId", "partId", "locationId");
CREATE UNIQUE INDEX "JobPartAllocation_id_companyId_key" ON "JobPartAllocation"("id", "companyId");

-- Replace weak single-column lineage constraints with tenant-qualified versions
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_jobId_fkey";
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_partId_fkey";

ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_jobId_fkey";
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_requirementId_fkey";
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_stockReservationId_fkey";
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_partId_fkey";
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_locationId_fkey";

ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_allocationId_fkey";
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_stockMovementId_fkey";

ALTER TABLE "JobPartRequirement"
  ADD CONSTRAINT "JobPartRequirement_job_tenant_fkey"
  FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPartRequirement"
  ADD CONSTRAINT "JobPartRequirement_part_tenant_fkey"
  FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_job_tenant_fkey"
  FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_requirement_tenant_fkey"
  FOREIGN KEY ("requirementId", "companyId") REFERENCES "JobPartRequirement"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_requirement_lineage_fkey"
  FOREIGN KEY ("requirementId", "companyId", "jobId", "partId")
  REFERENCES "JobPartRequirement"("id", "companyId", "jobId", "partId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_part_tenant_fkey"
  FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_location_tenant_fkey"
  FOREIGN KEY ("locationId", "companyId") REFERENCES "StorageLocation"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocation"
  ADD CONSTRAINT "JobPartAllocation_reservation_tenant_lineage_fkey"
  FOREIGN KEY ("stockReservationId", "companyId", "partId", "locationId")
  REFERENCES "StockReservation"("id", "companyId", "partId", "locationId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocationMovement"
  ADD CONSTRAINT "JobPartAllocationMovement_allocation_tenant_fkey"
  FOREIGN KEY ("allocationId", "companyId") REFERENCES "JobPartAllocation"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocationMovement"
  ADD CONSTRAINT "JobPartAllocationMovement_stockMovement_tenant_fkey"
  FOREIGN KEY ("stockMovementId", "companyId") REFERENCES "StockMovement"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobPartAllocationMovement"
  ADD CONSTRAINT "JobPartAllocationMovement_kind_return_disposition_chk"
  CHECK (
    ("kind" = 'ISSUE' AND "returnDisposition" IS NULL)
    OR
    ("kind" = 'RETURN' AND "returnDisposition" IS NOT NULL)
  );

ALTER TABLE "JobPartAllocationMovement"
  ADD CONSTRAINT "JobPartAllocationMovement_positive_qty_chk"
  CHECK ("quantity" > 0);