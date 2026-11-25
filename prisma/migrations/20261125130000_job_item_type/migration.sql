-- 2026-11-25, "multiple jobs within a job": each inside job (JobItem) can have its own job type.
-- NULL = follows the job's own type, so every item saved before this change keeps working untouched. No backfill needed.
ALTER TABLE "JobItem" ADD COLUMN "type" "JobType";
