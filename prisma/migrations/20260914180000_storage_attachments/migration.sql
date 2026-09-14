-- Storage architecture decision — see
-- claude/decision-storage-architecture-render-plus-object-storage.md.
-- Adds (1) a per-company file-storage override on CompanySettings (Super
-- Admin only — see the Platform > Companies > [company] "Storage location"
-- card) and (2) a generic Attachment model that new uploads route through
-- instead of a one-off Bytes column per feature. Existing inline-Bytes
-- tables (JobRfqQuote, JobAttachment, SupportTicketAttachment,
-- CompanySettings.logoData) are untouched by this migration — only
-- CompanySettings.logoObjectKey (already present, previously unused) starts
-- being written to, by application code, not by this migration.
CREATE TYPE "StorageProviderType" AS ENUM ('R2', 'B2', 'S3_COMPATIBLE');

CREATE TYPE "AttachmentOwnerType" AS ENUM ('JOB', 'RFQ_QUOTE', 'SUPPORT_TICKET', 'COMPANY_LOGO', 'GENERAL_RFQ');

CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'COMMITTED', 'ORPHANED');

ALTER TABLE "CompanySettings" ADD COLUMN "storageProvider" "StorageProviderType",
    ADD COLUMN "storageBucket" TEXT,
    ADD COLUMN "storageRegion" TEXT,
    ADD COLUMN "storageEndpoint" TEXT,
    ADD COLUMN "storageAccessKeyId" TEXT,
    ADD COLUMN "storageSecretAccessKey" TEXT,
    ADD COLUMN "storageConfiguredAt" TIMESTAMP(3);

CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerType" "AttachmentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Attachment_companyId_ownerType_ownerId_idx" ON "Attachment"("companyId", "ownerType", "ownerId");
CREATE INDEX "Attachment_status_idx" ON "Attachment"("status");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
