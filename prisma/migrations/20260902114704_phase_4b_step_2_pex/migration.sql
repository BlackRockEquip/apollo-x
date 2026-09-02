-- CreateEnum
CREATE TYPE "PexStockStatus" AS ENUM ('AVAILABLE', 'SUPPLIED', 'QUARANTINE', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "PexReturnStatus" AS ENUM ('EXPECTED', 'RECEIVED', 'CLOSED_WITHOUT_RETURN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "JobActivityType" ADD VALUE 'PEX_STOCK_TRANSFERRED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_STOCK_LINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_STOCK_UNLINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_AUTO_CREATED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_REGISTERED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_RECEIVED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_RELINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_SUPPLY_CANCELLED';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_RETURN_CLOSED_WITHOUT_CORE';
ALTER TYPE "JobActivityType" ADD VALUE 'PEX_STOCK_STATUS_CHANGED';

-- CreateTable
CREATE TABLE "PexStockUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "sourceJobComponentId" TEXT NOT NULL,
    "currentSupplyJobId" TEXT,
    "currentReturnJobId" TEXT,
    "storageLocationId" TEXT,
    "component" TEXT NOT NULL,
    "componentType" TEXT,
    "componentPartNumber" TEXT,
    "componentSerial" TEXT,
    "machineModel" TEXT,
    "machineSerial" TEXT,
    "status" "PexStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PexStockUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PexSupplyLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplyJobId" TEXT NOT NULL,
    "returnJobId" TEXT NOT NULL,
    "pexStockUnitId" TEXT NOT NULL,
    "returnStatus" "PexReturnStatus" NOT NULL DEFAULT 'EXPECTED',
    "expectedCoreDescription" TEXT,
    "expectedCoreType" TEXT,
    "expectedCorePartNumber" TEXT,
    "expectedCoreSerial" TEXT,
    "returnedCoreDescription" TEXT,
    "returnedCoreType" TEXT,
    "returnedCorePartNumber" TEXT,
    "returnedCoreSerial" TEXT,
    "returnMismatchReason" TEXT,
    "returnedReceivedAt" TIMESTAMP(3),
    "returnedReceivedById" TEXT,
    "closedWithoutReturnReason" TEXT,
    "closedWithoutReturnNote" TEXT,
    "closedWithoutReturnAt" TIMESTAMP(3),
    "closedWithoutReturnById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PexSupplyLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PexStockUnit_sourceJobComponentId_key" ON "PexStockUnit"("sourceJobComponentId");

-- CreateIndex
CREATE INDEX "PexStockUnit_companyId_status_createdAt_idx" ON "PexStockUnit"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PexStockUnit_companyId_sourceJobId_idx" ON "PexStockUnit"("companyId", "sourceJobId");

-- CreateIndex
CREATE INDEX "PexStockUnit_companyId_currentSupplyJobId_idx" ON "PexStockUnit"("companyId", "currentSupplyJobId");

-- CreateIndex
CREATE INDEX "PexStockUnit_companyId_currentReturnJobId_idx" ON "PexStockUnit"("companyId", "currentReturnJobId");

-- CreateIndex
CREATE INDEX "PexStockUnit_companyId_storageLocationId_idx" ON "PexStockUnit"("companyId", "storageLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "PexStockUnit_id_companyId_key" ON "PexStockUnit"("id", "companyId");

-- CreateIndex
CREATE INDEX "PexSupplyLink_companyId_pexStockUnitId_active_idx" ON "PexSupplyLink"("companyId", "pexStockUnitId", "active");

-- CreateIndex
CREATE INDEX "PexSupplyLink_companyId_returnStatus_active_idx" ON "PexSupplyLink"("companyId", "returnStatus", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PexSupplyLink_supplyJobId_companyId_key" ON "PexSupplyLink"("supplyJobId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PexSupplyLink_returnJobId_companyId_key" ON "PexSupplyLink"("returnJobId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PexSupplyLink_id_companyId_key" ON "PexSupplyLink"("id", "companyId");

-- Supporting composite key for tenant-qualified PEX lineage
-- CreateIndex
CREATE UNIQUE INDEX "JobComponent_id_companyId_key" ON "JobComponent"("id", "companyId");

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_sourceJob_tenant_fkey" FOREIGN KEY ("sourceJobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_sourceJobComponent_tenant_fkey" FOREIGN KEY ("sourceJobComponentId", "companyId") REFERENCES "JobComponent"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_currentSupplyJob_tenant_fkey" FOREIGN KEY ("currentSupplyJobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_currentReturnJob_tenant_fkey" FOREIGN KEY ("currentReturnJobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_storageLocation_tenant_fkey" FOREIGN KEY ("storageLocationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_supplyJob_tenant_fkey" FOREIGN KEY ("supplyJobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_returnJob_tenant_fkey" FOREIGN KEY ("returnJobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_pexStockUnit_tenant_fkey" FOREIGN KEY ("pexStockUnitId", "companyId") REFERENCES "PexStockUnit"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_returnedReceivedById_fkey" FOREIGN KEY ("returnedReceivedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_closedWithoutReturnById_fkey" FOREIGN KEY ("closedWithoutReturnById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;