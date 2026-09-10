/*
  Warnings:

  - You are about to drop the `JobPartAllocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JobPartAllocationMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JobPartRequirement` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PartLineStatus" AS ENUM ('PENDING', 'IN_STOCK', 'ON_ORDER', 'PARTIALLY_RECEIVED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "OutworkStatus" AS ENUM ('SENT_OUT', 'RECEIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobActivityType" ADD VALUE 'PART_LINE_RECEIVED';
ALTER TYPE "JobActivityType" ADD VALUE 'PART_LINE_RECEIVED_UNDONE';
ALTER TYPE "JobActivityType" ADD VALUE 'PART_LINE_ORDER_UPDATED';
ALTER TYPE "JobActivityType" ADD VALUE 'OUTWORK_SENT';
ALTER TYPE "JobActivityType" ADD VALUE 'OUTWORK_RECEIVED';
ALTER TYPE "JobActivityType" ADD VALUE 'OUTWORK_RECEIVED_UNDONE';
ALTER TYPE "JobActivityType" ADD VALUE 'OUTWORK_EDITED';
ALTER TYPE "JobActivityType" ADD VALUE 'OUTWORK_DELETED';

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_companyId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_jobId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_locationId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_partId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_stockReservationId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_allocationId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_companyId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_stockMovementId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_companyId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_jobId_fkey";

-- DropForeignKey
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_partId_fkey";

-- DropTable
DROP TABLE "JobPartAllocation";

-- DropTable
DROP TABLE "JobPartAllocationMovement";

-- DropTable
DROP TABLE "JobPartRequirement";

-- DropEnum
DROP TYPE "JobPartAllocationMovementKind";

-- DropEnum
DROP TYPE "JobPartReturnDisposition";

-- CreateTable
CREATE TABLE "JobPartLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL,
    "status" "PartLineStatus" NOT NULL DEFAULT 'PENDING',
    "receivedQuantity" DECIMAL(19,4),
    "previousStatus" "PartLineStatus",
    "orderNumber" TEXT,
    "orderedFromSupplierId" TEXT,
    "orderedAt" TIMESTAMP(3),
    "partId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPartLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutworkItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "OutworkStatus" NOT NULL DEFAULT 'SENT_OUT',
    "dateSentOut" TIMESTAMP(3),
    "dateReceived" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutworkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPartLine_companyId_jobId_idx" ON "JobPartLine"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobPartLine_companyId_partId_idx" ON "JobPartLine"("companyId", "partId");

-- CreateIndex
CREATE INDEX "JobPartLine_companyId_orderedFromSupplierId_idx" ON "JobPartLine"("companyId", "orderedFromSupplierId");

-- CreateIndex
CREATE INDEX "OutworkItem_companyId_jobId_idx" ON "OutworkItem"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "OutworkItem_companyId_supplierId_idx" ON "OutworkItem"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "OutworkItem_companyId_status_idx" ON "OutworkItem"("companyId", "status");

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_orderedFromSupplierId_fkey" FOREIGN KEY ("orderedFromSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
