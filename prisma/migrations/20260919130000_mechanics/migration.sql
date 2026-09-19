-- User request: "User Setup will be where an admin can setup Mechanic
-- Names that the corresponding fields in jobs pickup." Job.stripMechanicId/
-- buildMechanicId (added earlier the same day, migration
-- 20260831135829_phase_4a_jobs_wip_core) were originally FK'd to
-- UserIdentity via CompanyMembership — real system logins — but real
-- workshop mechanics very often don't have one. This migration retargets
-- both fields to a new, lightweight, admin-managed "Mechanic" named list
-- (see the Mechanic model comment in schema.prisma) instead, WITHOUT
-- losing any assignment already made since the fields launched: it
-- backfills one Mechanic row per distinct (company, displayName) actually
-- referenced by a Job's stripMechanicId/buildMechanicId, repoints those
-- Job rows to the new ids, and only then swaps the foreign keys. IDs are
-- generated in SQL rather than via gen_random_uuid() (extension
-- availability on Render's managed Postgres is unconfirmed and no prior
-- migration in this codebase relies on it) using the same 'c' + 24 hex
-- chars shape Prisma's own cuid() ids have, since Job.stripMechanicId/
-- buildMechanicId are validated with zod's z.string().cuid() (jobs/
-- validation.ts), whose check just requires a leading "c" with no
-- whitespace/hyphens.

-- CreateTable
CREATE TABLE "Mechanic" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mechanic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mechanic_companyId_name_key" ON "Mechanic"("companyId", "name");
CREATE INDEX "Mechanic_companyId_active_idx" ON "Mechanic"("companyId", "active");

ALTER TABLE "Mechanic" ADD CONSTRAINT "Mechanic_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data-preserving backfill: one Mechanic per distinct (company, name)
-- actually referenced by a Job's mechanic fields today. ON CONFLICT DO
-- NOTHING is a safety net for two UserIdentity rows in the same company
-- sharing a displayName (their job assignments then merge onto the single
-- resulting Mechanic row, which is an acceptable degrade for that edge
-- case).
INSERT INTO "Mechanic" ("id", "companyId", "name", "active", "createdAt", "updatedAt")
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  src."companyId",
  src."name",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT j."companyId" AS "companyId", u."displayName" AS "name"
  FROM "Job" j
  JOIN "UserIdentity" u ON u."id" = j."stripMechanicId"
  UNION
  SELECT DISTINCT j."companyId" AS "companyId", u."displayName" AS "name"
  FROM "Job" j
  JOIN "UserIdentity" u ON u."id" = j."buildMechanicId"
) src
ON CONFLICT ("companyId", "name") DO NOTHING;

-- Repoint existing Job rows from the old UserIdentity ids to the new
-- Mechanic ids, matched by (company, displayName).
UPDATE "Job" j
SET "stripMechanicId" = m."id"
FROM "UserIdentity" u, "Mechanic" m
WHERE j."stripMechanicId" = u."id"
  AND m."companyId" = j."companyId"
  AND m."name" = u."displayName";

UPDATE "Job" j
SET "buildMechanicId" = m."id"
FROM "UserIdentity" u, "Mechanic" m
WHERE j."buildMechanicId" = u."id"
  AND m."companyId" = j."companyId"
  AND m."name" = u."displayName";

-- Swap the foreign keys: Job.stripMechanicId/buildMechanicId now point at
-- Mechanic instead of UserIdentity. By this point every non-null value on
-- either column has already been repointed to a valid Mechanic id above.
ALTER TABLE "Job" DROP CONSTRAINT "Job_stripMechanicId_fkey";
ALTER TABLE "Job" DROP CONSTRAINT "Job_buildMechanicId_fkey";

ALTER TABLE "Job" ADD CONSTRAINT "Job_stripMechanicId_fkey" FOREIGN KEY ("stripMechanicId") REFERENCES "Mechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_buildMechanicId_fkey" FOREIGN KEY ("buildMechanicId") REFERENCES "Mechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
