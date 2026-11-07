-- Testing Reports module: spec templates per machine model and the test reports themselves.
CREATE TYPE "TestLayout" AS ENUM ('FORWARD_REVERSE', 'P1_P2');
CREATE TYPE "TestReportStatus" AS ENUM ('DRAFT', 'COMPLETED');
CREATE TYPE "TestResult" AS ENUM ('PASS', 'FAIL', 'PASS_WITH_NOTE');

CREATE TABLE "TestSpecTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineModels" TEXT[],
    "layout" "TestLayout" NOT NULL DEFAULT 'FORWARD_REVERSE',
    "inputRpm" INTEGER,
    "labelA" TEXT NOT NULL DEFAULT 'Forward',
    "labelB" TEXT NOT NULL DEFAULT 'Reverse',
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "clutchRows" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestSpecTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "jobId" TEXT,
    "templateId" TEXT,
    "spec" JSONB NOT NULL,
    "machineModel" TEXT NOT NULL,
    "serialNumber" TEXT,
    "customerName" TEXT,
    "testDate" DATE NOT NULL,
    "inputRpm" INTEGER,
    "testType" TEXT,
    "readings" JSONB NOT NULL DEFAULT '{}',
    "testers" TEXT[],
    "comments" TEXT,
    "status" "TestReportStatus" NOT NULL DEFAULT 'DRAFT',
    "result" "TestResult",
    "resultSummary" JSONB,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "retestOfId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestSpecTemplate_id_companyId_key" ON "TestSpecTemplate"("id", "companyId");
CREATE INDEX "TestSpecTemplate_companyId_active_idx" ON "TestSpecTemplate"("companyId", "active");
CREATE UNIQUE INDEX "TestReport_id_companyId_key" ON "TestReport"("id", "companyId");
CREATE UNIQUE INDEX "TestReport_companyId_number_key" ON "TestReport"("companyId", "number");
CREATE INDEX "TestReport_companyId_status_idx" ON "TestReport"("companyId", "status");
CREATE INDEX "TestReport_companyId_jobId_idx" ON "TestReport"("companyId", "jobId");

ALTER TABLE "TestSpecTemplate" ADD CONSTRAINT "TestSpecTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestReport" ADD CONSTRAINT "TestReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestReport" ADD CONSTRAINT "TestReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestReport" ADD CONSTRAINT "TestReport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TestSpecTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestReport" ADD CONSTRAINT "TestReport_retestOfId_fkey" FOREIGN KEY ("retestOfId") REFERENCES "TestReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
