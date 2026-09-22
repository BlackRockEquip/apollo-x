-- User request: "under Settings-Users-User Setup, add Sales Representative
-- same as mechanic field." Job.salesRepresentative was a plain free-text
-- column; this retargets it to a new, lightweight, admin-managed
-- "SalesRepresentative" named list (see the SalesRepresentative model
-- comment in schema.prisma) — the exact same pattern migration
-- 20260919130000_mechanics used for Job.stripMechanicId/buildMechanicId —
-- WITHOUT losing any value already typed into the free-text column: it
-- backfills one SalesRepresentative row per distinct (company, name)
-- actually present on a Job today, repoints those Job rows to the new ids
-- via a new salesRepresentativeId column, and only then drops the old
-- text column. IDs are generated in SQL rather than via
-- gen_random_uuid() (same reasoning as 20260919130000_mechanics — extension
-- availability on Render's managed Postgres is unconfirmed) using the same
-- 'c' + 24 hex chars shape Prisma's own cuid() ids have.

-- CreateTable
CREATE TABLE "SalesRepresentative" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRepresentative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesRepresentative_companyId_name_key" ON "SalesRepresentative"("companyId", "name");
CREATE INDEX "SalesRepresentative_companyId_active_idx" ON "SalesRepresentative"("companyId", "active");

ALTER TABLE "SalesRepresentative" ADD CONSTRAINT "SalesRepresentative_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add the new FK column alongside the old free-text one, still nullable
-- and unlinked at this point.
ALTER TABLE "Job" ADD COLUMN "salesRepresentativeId" TEXT;

-- Data-preserving backfill: one SalesRepresentative per distinct
-- (company, name) actually typed into Job.salesRepresentative today.
-- Blank/whitespace-only values are skipped (they'd otherwise create a
-- useless "" entry in the admin list).
INSERT INTO "SalesRepresentative" ("id", "companyId", "name", "active", "createdAt", "updatedAt")
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  src."companyId",
  src."name",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT j."companyId" AS "companyId", trim(j."salesRepresentative") AS "name"
  FROM "Job" j
  WHERE j."salesRepresentative" IS NOT NULL AND trim(j."salesRepresentative") <> ''
) src
ON CONFLICT ("companyId", "name") DO NOTHING;

-- Repoint existing Job rows from the old free-text value to the new
-- SalesRepresentative id, matched by (company, trimmed name).
UPDATE "Job" j
SET "salesRepresentativeId" = sr."id"
FROM "SalesRepresentative" sr
WHERE j."salesRepresentative" IS NOT NULL
  AND trim(j."salesRepresentative") <> ''
  AND sr."companyId" = j."companyId"
  AND sr."name" = trim(j."salesRepresentative");

-- Now that every non-blank value has been repointed, the old free-text
-- column is redundant — drop it and add the FK on its replacement.
ALTER TABLE "Job" DROP COLUMN "salesRepresentative";

ALTER TABLE "Job" ADD CONSTRAINT "Job_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
