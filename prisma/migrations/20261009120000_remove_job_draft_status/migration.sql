-- Remove the DRAFT job status. Jobs are numbered and active from the moment
-- they are created, so nothing sits in Draft any more.

-- 1. Move any job still in Draft to the first stage of its own flow.
UPDATE "Job"
SET "status" = CASE WHEN "type" = 'FIELD_SERVICE' THEN 'TO_ATTEND'::"JobStatus" ELSE 'TO_BE_COLLECTED'::"JobStatus" END
WHERE "status" = 'DRAFT';

-- 2. Rebuild the enum without DRAFT (Postgres cannot drop a single enum value).
ALTER TABLE "Job" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "JobStatus_new" AS ENUM ('TO_BE_COLLECTED', 'TO_BE_RECEIVED', 'TO_STRIP', 'STRIPPING', 'QUOTE_IN_PROGRESS', 'AWAITING_GO_AHEAD', 'AWAIT_OUTWORK', 'WAITING_FOR_PARTS', 'ASSEMBLY', 'TESTING', 'TO_PAINT_WRAP', 'TO_BE_DELIVERED', 'DELIVERED_AWAITING_PAYMENT', 'COMPLETE', 'CLOSED', 'CANCELLED', 'RETURNED_UNREPAIRED', 'TO_ATTEND', 'ON_ROUTE', 'IN_PROGRESS', 'AWAIT_PAYMENT', 'RECEIVED', 'INSPECTING');
ALTER TABLE "Job" ALTER COLUMN "status" TYPE "JobStatus_new" USING ("status"::text::"JobStatus_new");
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "JobStatus_old";
ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'TO_BE_COLLECTED';
