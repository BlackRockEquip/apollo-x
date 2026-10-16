-- Industry builds, step A: keep every existing company's access exactly as it
-- is today. Parts, pick slips, RFQs and Outwork currently ride on the Jobs &
-- WIP licence (and Field Service is not checked at all), so each company that
-- has a Jobs & WIP entitlement gets matching rows for the modules that are now
-- switched separately. Nothing is taken away from anyone.

-- History first (the NOT EXISTS test below is still true at this point).
INSERT INTO "EntitlementHistory" ("id", "companyId", "product", "module", "previousStatus", "newStatus", "source", "effectiveAt", "expiresAt", "reason", "changedById")
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || e."companyId" || k."module"::text), 1, 24),
  e."companyId", e."product", k."module", NULL, e."status", e."source", e."effectiveFrom", e."expiresAt",
  'Industry builds: switched separately from Jobs & WIP; copied from the Jobs & WIP entitlement so access is unchanged', NULL
FROM "CompanyModuleEntitlement" e
CROSS JOIN (VALUES ('JOB_PARTS'::"ModuleKey"), ('PICK_SLIPS'::"ModuleKey"), ('PROCUREMENT'::"ModuleKey"), ('OUTWORK'::"ModuleKey"), ('FIELD_SERVICE'::"ModuleKey")) AS k("module")
WHERE e."module" = 'JOBS_WIP' AND e."product" = 'WORKSHOP'
  AND NOT EXISTS (
    SELECT 1 FROM "CompanyModuleEntitlement" x
    WHERE x."companyId" = e."companyId" AND x."product" = e."product" AND x."module" = k."module"
  );

INSERT INTO "CompanyModuleEntitlement" ("id", "companyId", "product", "module", "source", "status", "effectiveFrom", "expiresAt", "gracePeriodDays", "readOnlyOverrideUntil", "updatedAt")
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || e."companyId" || k."module"::text), 1, 24),
  e."companyId", e."product", k."module", e."source", e."status", e."effectiveFrom", e."expiresAt", e."gracePeriodDays", e."readOnlyOverrideUntil", CURRENT_TIMESTAMP
FROM "CompanyModuleEntitlement" e
CROSS JOIN (VALUES ('JOB_PARTS'::"ModuleKey"), ('PICK_SLIPS'::"ModuleKey"), ('PROCUREMENT'::"ModuleKey"), ('OUTWORK'::"ModuleKey"), ('FIELD_SERVICE'::"ModuleKey")) AS k("module")
WHERE e."module" = 'JOBS_WIP' AND e."product" = 'WORKSHOP'
  AND NOT EXISTS (
    SELECT 1 FROM "CompanyModuleEntitlement" x
    WHERE x."companyId" = e."companyId" AND x."product" = e."product" AND x."module" = k."module"
  );
