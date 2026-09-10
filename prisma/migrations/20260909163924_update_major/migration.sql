-- The two new enum values used below (RfqRequestStatus.SKIPPED) were split
-- out into an earlier migration (20260909163920_add_status_enum_values) —
-- PostgreSQL requires a new enum value to be committed in its own
-- transaction/migration before it can be used elsewhere (e.g. as a column
-- DEFAULT here). See that migration's comment for the P3006 error this
-- fixes.

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "smtpConfiguredAt" TIMESTAMP(3),
ADD COLUMN     "smtpFromAddress" TEXT,
ADD COLUMN     "smtpFromName" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smtpUsername" TEXT;

-- AlterTable
ALTER TABLE "JobRfqRequest" ADD COLUMN     "lastSendError" TEXT,
ALTER COLUMN "status" SET DEFAULT 'SKIPPED';

-- AlterTable
ALTER TABLE "OutworkItem" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "OutworkItem_companyId_batchId_idx" ON "OutworkItem"("companyId", "batchId");
