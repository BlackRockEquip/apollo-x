-- Picking slips: create a PickSlip (grouping record) plus a PickSlipLine
-- per part actually picked, so a picking slip generated from Stock Levels
-- can be allocated to a job, reprinted later from history, and stays
-- traceable back to the part/bin it was issued from. Mirrors the existing
-- StockMovement/JobPartLine FK conventions in this schema (Restrict where
-- the parent record must not vanish out from under a kept audit trail,
-- SetNull where losing the reference is harmless).
CREATE TABLE "PickSlip" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickSlip_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickSlip_companyId_jobId_idx" ON "PickSlip"("companyId", "jobId");
CREATE INDEX "PickSlip_companyId_createdAt_idx" ON "PickSlip"("companyId", "createdAt");

ALTER TABLE "PickSlip" ADD CONSTRAINT "PickSlip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickSlip" ADD CONSTRAINT "PickSlip_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickSlip" ADD CONSTRAINT "PickSlip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PickSlipLine" (
    "id" TEXT NOT NULL,
    "pickSlipId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "binLocationId" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickSlipLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickSlipLine_pickSlipId_idx" ON "PickSlipLine"("pickSlipId");
CREATE INDEX "PickSlipLine_partId_idx" ON "PickSlipLine"("partId");

ALTER TABLE "PickSlipLine" ADD CONSTRAINT "PickSlipLine_pickSlipId_fkey" FOREIGN KEY ("pickSlipId") REFERENCES "PickSlip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickSlipLine" ADD CONSTRAINT "PickSlipLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickSlipLine" ADD CONSTRAINT "PickSlipLine_binLocationId_fkey" FOREIGN KEY ("binLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
