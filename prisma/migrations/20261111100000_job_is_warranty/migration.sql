-- 2026-11-11: warranty is a tickbox on a job ("Is warranty"), not a job type of its own, so a warranty job can be a field job or a
-- workshop job. The WARRANTY value stays in the JobType enum (dropping an enum value is risky and old rows/history still read it); it is
-- simply no longer offered or saved.

-- 1. The flag.
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "isWarranty" BOOLEAN NOT NULL DEFAULT false;

-- 2. Every job saved with the retired Warranty type becomes a Standard repair with the tickbox on. Both used the main workshop status
--    flow, so the job's status is unchanged. Whoever wants a former warranty job to be a field job changes its type on the job screen.
UPDATE "Job" SET "isWarranty" = true, "type" = 'STANDARD_REPAIR' WHERE "type" = 'WARRANTY';

-- 3. Any warranty job without a claim record gets a Pending one, so the Warranty tab always has something to show.
INSERT INTO "JobWarranty" ("id", "companyId", "jobId", "status", "createdAt", "updatedAt")
SELECT 'c' || substr(md5(random()::text || j."id"), 1, 24), j."companyId", j."id", 'PENDING', NOW(), NOW()
FROM "Job" j
WHERE j."isWarranty" = true
  AND NOT EXISTS (SELECT 1 FROM "JobWarranty" w WHERE w."jobId" = j."id");
