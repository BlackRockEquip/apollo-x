-- CreateTable
CREATE TABLE "JobPresence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPresence_companyId_jobId_lastSeenAt_idx" ON "JobPresence"("companyId", "jobId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobPresence_jobId_userId_key" ON "JobPresence"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "JobPresence" ADD CONSTRAINT "JobPresence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPresence" ADD CONSTRAINT "JobPresence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPresence" ADD CONSTRAINT "JobPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
