-- Failure Reports module: reports, their photos, and the company profiles (logo, colours, details) they are printed with.
CREATE TABLE "FailureReportProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "logoData" TEXT,
    "logoAspect" DOUBLE PRECISION NOT NULL DEFAULT 1.4,
    "logoDark" BOOLEAN NOT NULL DEFAULT false,
    "accent" TEXT NOT NULL DEFAULT 'F0B429',
    "dark" TEXT NOT NULL DEFAULT '14213D',
    "accentText" TEXT,
    "headerStyle" TEXT NOT NULL DEFAULT 'auto',
    "details" JSONB NOT NULL DEFAULT '{}',
    "footer" TEXT,
    "showDetails" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FailureReportProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FailureReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "profileId" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "warranty" TEXT NOT NULL DEFAULT 'na',
    "perPage" INTEGER NOT NULL DEFAULT 4,
    "descHeading" TEXT NOT NULL DEFAULT 'DESCRIPTION',
    "replaceItems" TEXT[],
    "repairItems" TEXT[],
    "missingItems" TEXT[],
    "jobValues" JSONB,
    "timesCreated" INTEGER NOT NULL DEFAULT 0,
    "lastCreatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FailureReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FailureReportPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "marks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FailureReportPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FailureReportProfile_companyId_active_idx" ON "FailureReportProfile"("companyId", "active");
CREATE INDEX "FailureReport_companyId_updatedAt_idx" ON "FailureReport"("companyId", "updatedAt");
CREATE INDEX "FailureReport_companyId_jobId_idx" ON "FailureReport"("companyId", "jobId");
CREATE INDEX "FailureReportPhoto_reportId_sortOrder_idx" ON "FailureReportPhoto"("reportId", "sortOrder");

ALTER TABLE "FailureReportProfile" ADD CONSTRAINT "FailureReportProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FailureReport" ADD CONSTRAINT "FailureReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FailureReport" ADD CONSTRAINT "FailureReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FailureReport" ADD CONSTRAINT "FailureReport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FailureReportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FailureReportPhoto" ADD CONSTRAINT "FailureReportPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FailureReportPhoto" ADD CONSTRAINT "FailureReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FailureReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
