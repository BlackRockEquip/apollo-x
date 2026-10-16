-- Specifications module: Dimensional Size Report tables.
CREATE TYPE "DimensionPhase" AS ENUM ('ARRIVED', 'AFTER_MACHINING');

CREATE TABLE "JobDimensionReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reportDate" DATE,
    "drawingNumber" TEXT,
    "machine" TEXT,
    "component" TEXT,
    "measuredBy" TEXT,
    "operator" TEXT,
    "instrument" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobDimensionReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobDimensionLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "phase" "DimensionPhase" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "partNumber" TEXT,
    "description" TEXT,
    "outerDiameter" TEXT,
    "innerDiameter" TEXT,
    "length" TEXT,
    "tolerance" TEXT,
    "additionalMeasured" TEXT,
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobDimensionLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecificationFormSettings" (
    "companyId" TEXT NOT NULL,
    "standardText" TEXT,
    "documentNumber" TEXT,
    "issueDate" TEXT,
    "revision" TEXT,
    "revisionDate" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecificationFormSettings_pkey" PRIMARY KEY ("companyId")
);

CREATE UNIQUE INDEX "JobDimensionReport_id_companyId_key" ON "JobDimensionReport"("id", "companyId");
CREATE INDEX "JobDimensionReport_companyId_jobId_idx" ON "JobDimensionReport"("companyId", "jobId");
CREATE INDEX "JobDimensionLine_reportId_phase_sortOrder_idx" ON "JobDimensionLine"("reportId", "phase", "sortOrder");
CREATE INDEX "JobDimensionLine_companyId_reportId_idx" ON "JobDimensionLine"("companyId", "reportId");

ALTER TABLE "JobDimensionReport" ADD CONSTRAINT "JobDimensionReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobDimensionReport" ADD CONSTRAINT "JobDimensionReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobDimensionLine" ADD CONSTRAINT "JobDimensionLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobDimensionLine" ADD CONSTRAINT "JobDimensionLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "JobDimensionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecificationFormSettings" ADD CONSTRAINT "SpecificationFormSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
