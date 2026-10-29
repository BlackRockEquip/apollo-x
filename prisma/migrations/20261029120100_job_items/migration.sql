-- Engineering multi-item jobs: one row per item a customer sent in on a single job.
-- A job with no rows is a normal one-item job, so nothing existing is backfilled or changed.
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'TO_BE_RECEIVED',
    "component" TEXT,
    "componentModel" TEXT,
    "componentSerial" TEXT,
    "componentPartNumber" TEXT,
    "machineMake" TEXT,
    "machineModel" TEXT,
    "machineSerial" TEXT,
    "plantNumber" TEXT,
    "machineHours" DECIMAL(19,4),
    "workRequested" TEXT,
    "conditionOnReceipt" TEXT,
    "etaDate" TIMESTAMP(3),
    "mechanicEtaDate" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobItem_jobId_sequence_key" ON "JobItem"("jobId", "sequence");
CREATE UNIQUE INDEX "JobItem_id_companyId_key" ON "JobItem"("id", "companyId");
CREATE INDEX "JobItem_companyId_jobId_idx" ON "JobItem"("companyId", "jobId");
CREATE INDEX "JobItem_companyId_status_idx" ON "JobItem"("companyId", "status");

ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
