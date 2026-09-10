-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'PARTS_FOLLOWUP_SENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
--
-- Split into its own migration (separate from 20260909163924_update_major)
-- because PostgreSQL will not let a newly-added enum value be used
-- (e.g. as a column DEFAULT) in the same transaction that adds it —
-- `prisma migrate dev` failed with P3006 ("unsafe use of new value
-- 'SKIPPED'...") when this lived in one migration together with
-- JobRfqRequest.status's new DEFAULT 'SKIPPED'. This migration must be
-- applied and committed before the next one runs.

ALTER TYPE "RfqRequestStatus" ADD VALUE 'SENT';
ALTER TYPE "RfqRequestStatus" ADD VALUE 'FAILED';
ALTER TYPE "RfqRequestStatus" ADD VALUE 'SKIPPED';
