-- 2026-11-25, jobs within a job: each inside job can have its own customer PO (null = follows the job's own PO).
ALTER TABLE "JobItem" ADD COLUMN "customerPo" TEXT;
