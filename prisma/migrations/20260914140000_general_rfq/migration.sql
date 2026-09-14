-- General RFQs — a "job-less" companion to JobRfqRequest, added 2026-09-14
-- for the Suppliers screen's RFQ tab ("Add RFQ" that can optionally link to
-- a job). See the GeneralRfqRequest model comment in schema.prisma for why
-- this is a separate, simpler model rather than making JobRfqRequest.jobId
-- nullable.
CREATE TYPE "GeneralRfqStatus" AS ENUM ('SENT', 'RECEIVED', 'SKIPPED');

CREATE TABLE "GeneralRfqRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "partsDescription" TEXT NOT NULL,
    "quantityOutstanding" INTEGER,
    "status" "GeneralRfqStatus" NOT NULL DEFAULT 'SENT',
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralRfqRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneralRfqRequest_companyId_supplierId_idx" ON "GeneralRfqRequest"("companyId", "supplierId");
CREATE INDEX "GeneralRfqRequest_companyId_status_idx" ON "GeneralRfqRequest"("companyId", "status");

ALTER TABLE "GeneralRfqRequest" ADD CONSTRAINT "GeneralRfqRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralRfqRequest" ADD CONSTRAINT "GeneralRfqRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneralRfqRequest" ADD CONSTRAINT "GeneralRfqRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneralRfqRequest" ADD CONSTRAINT "GeneralRfqRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
