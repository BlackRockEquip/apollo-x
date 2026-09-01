-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('STANDARD_REPAIR', 'PARTIAL_REPAIR', 'PEX_SUPPLY', 'PEX_RETURN', 'OUTRIGHT_SALE', 'FIELD_SERVICE', 'WARRANTY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'TO_BE_COLLECTED', 'TO_BE_RECEIVED', 'STRIPPING', 'QUOTE_IN_PROGRESS', 'AWAITING_GO_AHEAD', 'WAITING_FOR_PARTS', 'ASSEMBLY', 'TESTING', 'TO_BE_DELIVERED', 'COMPLETE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobActivityType" AS ENUM ('JOB_CREATED', 'JOB_REGISTERED', 'STATUS_CHANGED', 'JOB_CLOSED', 'JOB_REOPENED', 'PART_ADDED', 'PART_REMOVED', 'PART_RESERVED', 'RESERVATION_RELEASED', 'PART_ISSUED', 'PART_RETURNED', 'NOTE_ADDED', 'FIELD_SERVICE_UPDATED', 'WARRANTY_UPDATED');

-- CreateEnum
CREATE TYPE "JobWarrantyStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED');

-- DropForeignKey
ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_branch_tenant_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_customer_tenant_fkey";

-- DropForeignKey
ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerBranch" DROP CONSTRAINT "CustomerBranch_customer_tenant_fkey";

-- DropForeignKey
ALTER TABLE "CustomerBranch" DROP CONSTRAINT "CustomerBranch_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "CustomerContact" DROP CONSTRAINT "CustomerContact_branch_tenant_fkey";

-- DropForeignKey
ALTER TABLE "CustomerContact" DROP CONSTRAINT "CustomerContact_customer_tenant_fkey";

-- DropForeignKey
ALTER TABLE "CustomerContact" DROP CONSTRAINT "CustomerContact_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockCount" DROP CONSTRAINT "StockCount_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockCountLine" DROP CONSTRAINT "StockCountLine_companyId_fkey";

-- DropForeignKey
ALTER TABLE "StockCountLine" DROP CONSTRAINT "StockCountLine_countId_fkey";

-- DropForeignKey
ALTER TABLE "StockCountLine" DROP CONSTRAINT "StockCountLine_count_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockCountLine" DROP CONSTRAINT "StockCountLine_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_from_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_to_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockReservation" DROP CONSTRAINT "StockReservation_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StockReservation" DROP CONSTRAINT "StockReservation_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "StorageLocation" DROP CONSTRAINT "StorageLocation_parent_tenant_fkey";

-- DropForeignKey
ALTER TABLE "SupplierAddress" DROP CONSTRAINT "SupplierAddress_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "SupplierAddress" DROP CONSTRAINT "SupplierAddress_supplier_tenant_fkey";

-- DropForeignKey
ALTER TABLE "SupplierContact" DROP CONSTRAINT "SupplierContact_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "SupplierContact" DROP CONSTRAINT "SupplierContact_supplier_tenant_fkey";

-- DropForeignKey
ALTER TABLE "SupplierManufacturer" DROP CONSTRAINT "SupplierManufacturer_brand_tenant_fkey";

-- DropForeignKey
ALTER TABLE "SupplierManufacturer" DROP CONSTRAINT "SupplierManufacturer_deactivatedById_fkey";

-- DropForeignKey
ALTER TABLE "SupplierManufacturer" DROP CONSTRAINT "SupplierManufacturer_supplier_tenant_fkey";

-- DropIndex
DROP INDEX "CommercialTerm_id_companyId_key";

-- DropIndex
DROP INDEX "Customer_id_companyId_key";

-- DropIndex
DROP INDEX "CustomerBranch_id_companyId_key";

-- DropIndex
DROP INDEX "Manufacturer_id_companyId_key";

-- DropIndex
DROP INDEX "Part_id_companyId_key";

-- DropIndex
DROP INDEX "StockCount_id_companyId_key";

-- DropIndex
DROP INDEX "StorageLocation_id_companyId_key";

-- DropIndex
DROP INDEX "Supplier_id_companyId_key";

-- DropIndex
DROP INDEX "TaxCode_id_companyId_key";

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobNumber" TEXT,
    "draftNumber" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "JobType" NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerReference" TEXT,
    "customerPo" TEXT,
    "dateReceived" TIMESTAMP(3),
    "machineModel" TEXT,
    "machineSerial" TEXT,
    "component" TEXT,
    "componentType" TEXT,
    "componentSerial" TEXT,
    "componentPartNumber" TEXT,
    "description" TEXT,
    "etaDate" TIMESTAMP(3),
    "relationshipNotes" TEXT,
    "relatedJobId" TEXT,
    "stripMechanicId" TEXT,
    "buildMechanicId" TEXT,
    "closingOutcome" TEXT,
    "closingNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "componentType" TEXT,
    "componentSerial" TEXT,
    "componentPartNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPartRequirement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantityRequired" DECIMAL(19,4) NOT NULL,
    "notes" TEXT,
    "etaDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPartRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPartAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "stockReservationId" TEXT,
    "issueMovementId" TEXT,
    "returnMovementId" TEXT,
    "quantityReserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantityIssued" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantityReturned" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPartAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "JobActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFieldServiceReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "site" TEXT,
    "technician" TEXT,
    "vehicle" TEXT,
    "hours" DECIMAL(19,4),
    "report" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFieldServiceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobWarranty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "JobWarrantyStatus" NOT NULL,
    "notes" TEXT,
    "historicalSourceStatus" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobWarranty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Job_draftNumber_key" ON "Job"("draftNumber");

-- CreateIndex
CREATE INDEX "Job_companyId_status_createdAt_idx" ON "Job"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_companyId_type_createdAt_idx" ON "Job"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Job_companyId_customerId_createdAt_idx" ON "Job"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "JobComponent_companyId_jobId_idx" ON "JobComponent"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobPartRequirement_companyId_jobId_idx" ON "JobPartRequirement"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobPartRequirement_companyId_partId_idx" ON "JobPartRequirement"("companyId", "partId");

-- CreateIndex
CREATE INDEX "JobPartAllocation_companyId_jobId_idx" ON "JobPartAllocation"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobPartAllocation_companyId_requirementId_idx" ON "JobPartAllocation"("companyId", "requirementId");

-- CreateIndex
CREATE INDEX "JobNote_companyId_jobId_createdAt_idx" ON "JobNote"("companyId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobActivity_companyId_jobId_createdAt_idx" ON "JobActivity"("companyId", "jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobFieldServiceReport_jobId_key" ON "JobFieldServiceReport"("jobId");

-- CreateIndex
CREATE INDEX "JobFieldServiceReport_companyId_jobId_idx" ON "JobFieldServiceReport"("companyId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobWarranty_jobId_key" ON "JobWarranty"("jobId");

-- CreateIndex
CREATE INDEX "JobWarranty_companyId_jobId_idx" ON "JobWarranty"("companyId", "jobId");

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_relatedJobId_fkey" FOREIGN KEY ("relatedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_stripMechanicId_fkey" FOREIGN KEY ("stripMechanicId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_buildMechanicId_fkey" FOREIGN KEY ("buildMechanicId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobComponent" ADD CONSTRAINT "JobComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobComponent" ADD CONSTRAINT "JobComponent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartRequirement" ADD CONSTRAINT "JobPartRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartRequirement" ADD CONSTRAINT "JobPartRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartRequirement" ADD CONSTRAINT "JobPartRequirement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "JobPartRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_stockReservationId_fkey" FOREIGN KEY ("stockReservationId") REFERENCES "StockReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_issueMovementId_fkey" FOREIGN KEY ("issueMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_returnMovementId_fkey" FOREIGN KEY ("returnMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFieldServiceReport" ADD CONSTRAINT "JobFieldServiceReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFieldServiceReport" ADD CONSTRAINT "JobFieldServiceReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobWarranty" ADD CONSTRAINT "JobWarranty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobWarranty" ADD CONSTRAINT "JobWarranty_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
