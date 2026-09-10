-- CreateEnum
CREATE TYPE "RfqRequestStatus" AS ENUM ('REQUESTED', 'QUOTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobActivityType" ADD VALUE 'RFQ_REQUESTED';
ALTER TYPE "JobActivityType" ADD VALUE 'RFQ_REQUEST_REMOVED';
ALTER TYPE "JobActivityType" ADD VALUE 'RFQ_QUOTE_RECORDED';
ALTER TYPE "JobActivityType" ADD VALUE 'RFQ_PREFERRED_SUPPLIER_SET';

-- CreateTable
CREATE TABLE "JobRfqRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "partsSummary" TEXT NOT NULL,
    "status" "RfqRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRfqRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRfqQuote" (
    "id" TEXT NOT NULL,
    "rfqRequestId" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "data" BYTEA,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRfqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRfqQuoteLine" (
    "id" TEXT NOT NULL,
    "rfqQuoteId" TEXT NOT NULL,
    "partLineId" TEXT NOT NULL,
    "unitPrice" DECIMAL(19,4),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobRfqQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRfqRequest_companyId_jobId_idx" ON "JobRfqRequest"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobRfqRequest_companyId_supplierId_idx" ON "JobRfqRequest"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRfqRequest_jobId_supplierId_key" ON "JobRfqRequest"("jobId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRfqQuote_rfqRequestId_key" ON "JobRfqQuote"("rfqRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRfqQuoteLine_rfqQuoteId_partLineId_key" ON "JobRfqQuoteLine"("rfqQuoteId", "partLineId");

-- AddForeignKey
ALTER TABLE "JobRfqRequest" ADD CONSTRAINT "JobRfqRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqRequest" ADD CONSTRAINT "JobRfqRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqRequest" ADD CONSTRAINT "JobRfqRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqRequest" ADD CONSTRAINT "JobRfqRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqRequest" ADD CONSTRAINT "JobRfqRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqQuote" ADD CONSTRAINT "JobRfqQuote_rfqRequestId_fkey" FOREIGN KEY ("rfqRequestId") REFERENCES "JobRfqRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqQuote" ADD CONSTRAINT "JobRfqQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqQuoteLine" ADD CONSTRAINT "JobRfqQuoteLine_rfqQuoteId_fkey" FOREIGN KEY ("rfqQuoteId") REFERENCES "JobRfqQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRfqQuoteLine" ADD CONSTRAINT "JobRfqQuoteLine_partLineId_fkey" FOREIGN KEY ("partLineId") REFERENCES "JobPartLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
