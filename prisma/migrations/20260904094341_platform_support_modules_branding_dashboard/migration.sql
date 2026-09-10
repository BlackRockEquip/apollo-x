-- CreateEnum
CREATE TYPE "ModuleCatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PLANNED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketMessageKind" AS ENUM ('REPLY', 'INTERNAL_NOTE');

-- DropForeignKey
ALTER TABLE "JobKitLine" DROP CONSTRAINT "JobKitLine_jobKit_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobKitLine" DROP CONSTRAINT "JobKitLine_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_job_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_location_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_requirement_lineage_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_requirement_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocation" DROP CONSTRAINT "JobPartAllocation_reservation_tenant_lineage_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_allocation_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartAllocationMovement" DROP CONSTRAINT "JobPartAllocationMovement_stockMovement_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_job_tenant_fkey";

-- DropForeignKey
ALTER TABLE "JobPartRequirement" DROP CONSTRAINT "JobPartRequirement_part_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexStockUnit" DROP CONSTRAINT "PexStockUnit_currentReturnJob_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexStockUnit" DROP CONSTRAINT "PexStockUnit_currentSupplyJob_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexStockUnit" DROP CONSTRAINT "PexStockUnit_sourceJobComponent_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexStockUnit" DROP CONSTRAINT "PexStockUnit_sourceJob_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexStockUnit" DROP CONSTRAINT "PexStockUnit_storageLocation_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT "PexSupplyLink_pexStockUnit_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT "PexSupplyLink_returnJob_tenant_fkey";

-- DropForeignKey
ALTER TABLE "PexSupplyLink" DROP CONSTRAINT "PexSupplyLink_supplyJob_tenant_fkey";

-- DropIndex
DROP INDEX "JobPartAllocation_id_companyId_key";

-- DropIndex
DROP INDEX "JobPartRequirement_id_companyId_jobId_partId_key";

-- DropIndex
DROP INDEX "JobPartRequirement_id_companyId_key";

-- DropIndex
DROP INDEX "Part_id_companyId_key";

-- DropIndex
DROP INDEX "StockMovement_id_companyId_key";

-- DropIndex
DROP INDEX "StockReservation_id_companyId_key";

-- DropIndex
DROP INDEX "StockReservation_id_companyId_partId_locationId_key";

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "logoData" BYTEA,
ADD COLUMN     "logoFileName" TEXT,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoSizeBytes" INTEGER,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "secondaryColor" TEXT;

-- CreateTable
CREATE TABLE "ModuleCatalogEntry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "moduleKey" "ModuleKey",
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "ModuleCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "icon" TEXT,
    "navGroup" TEXT,
    "navOrder" INTEGER,
    "route" TEXT,
    "assignableToTenants" BOOLEAN NOT NULL DEFAULT false,
    "userAssignable" BOOLEAN NOT NULL DEFAULT true,
    "dependsOn" "ModuleKey"[],
    "licensingMetadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSequence" (
    "key" TEXT NOT NULL,
    "nextValue" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "moduleKey" "ModuleKey",
    "pageRoute" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "reportedById" TEXT NOT NULL,
    "assignedSupportId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "TicketMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDashboardConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDashboardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleCatalogEntry_code_key" ON "ModuleCatalogEntry"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleCatalogEntry_moduleKey_key" ON "ModuleCatalogEntry"("moduleKey");

-- CreateIndex
CREATE INDEX "ModuleCatalogEntry_category_status_idx" ON "ModuleCatalogEntry"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_status_priority_idx" ON "SupportTicket"("companyId", "status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_createdAt_idx" ON "SupportTicket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedSupportId_status_idx" ON "SupportTicket"("assignedSupportId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_ticketId_idx" ON "SupportTicketAttachment"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDashboardConfig_userId_companyId_key" ON "UserDashboardConfig"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_sourceJobComponentId_fkey" FOREIGN KEY ("sourceJobComponentId") REFERENCES "JobComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_currentSupplyJobId_fkey" FOREIGN KEY ("currentSupplyJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_currentReturnJobId_fkey" FOREIGN KEY ("currentReturnJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexStockUnit" ADD CONSTRAINT "PexStockUnit_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_supplyJobId_fkey" FOREIGN KEY ("supplyJobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_returnJobId_fkey" FOREIGN KEY ("returnJobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PexSupplyLink" ADD CONSTRAINT "PexSupplyLink_pexStockUnitId_fkey" FOREIGN KEY ("pexStockUnitId") REFERENCES "PexStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKitLine" ADD CONSTRAINT "JobKitLine_jobKitId_fkey" FOREIGN KEY ("jobKitId") REFERENCES "JobKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKitLine" ADD CONSTRAINT "JobKitLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartRequirement" ADD CONSTRAINT "JobPartRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartRequirement" ADD CONSTRAINT "JobPartRequirement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "JobPartRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocation" ADD CONSTRAINT "JobPartAllocation_stockReservationId_fkey" FOREIGN KEY ("stockReservationId") REFERENCES "StockReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocationMovement" ADD CONSTRAINT "JobPartAllocationMovement_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "JobPartAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPartAllocationMovement" ADD CONSTRAINT "JobPartAllocationMovement_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleCatalogEntry" ADD CONSTRAINT "ModuleCatalogEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedSupportId_fkey" FOREIGN KEY ("assignedSupportId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDashboardConfig" ADD CONSTRAINT "UserDashboardConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDashboardConfig" ADD CONSTRAINT "UserDashboardConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
