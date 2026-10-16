-- Industry builds step B: which companies already hold data in a module they
-- do not have switched on? Read-only query (changes nothing). Run it in your
-- SQL tool after the step A migrations, before or after deploying step B.
-- A row means: that company has records of that kind but no entitlement for the
-- module, so it will no longer be able to add/edit them once step B is live
-- (existing records stay in the database). Black Rock is skipped (all modules).
WITH have AS (
  SELECT "companyId", "module" FROM "CompanyModuleEntitlement" WHERE "product" = 'WORKSHOP'
),
usage AS (
  SELECT "companyId", 'JOB_PARTS' AS module, count(*) AS records FROM "JobPartLine" GROUP BY 1
  UNION ALL SELECT "companyId", 'OUTWORK', count(*) FROM "OutworkItem" GROUP BY 1
  UNION ALL SELECT "companyId", 'PROCUREMENT', count(*) FROM "JobRfqRequest" GROUP BY 1
  UNION ALL SELECT "companyId", 'PICK_SLIPS', count(*) FROM "PickSlip" GROUP BY 1
  UNION ALL SELECT "companyId", 'FIELD_SERVICE', count(*) FROM "Job" WHERE "type" = 'FIELD_SERVICE' GROUP BY 1
  UNION ALL SELECT "companyId", 'PEX_STOCK', count(*) FROM "Job" WHERE "type" IN ('PEX_SUPPLY', 'PEX_RETURN') GROUP BY 1
)
SELECT c."internalCode", c."legalName", u.module, u.records,
       CASE WHEN u.module = 'PICK_SLIPS' AND EXISTS (SELECT 1 FROM have h WHERE h."companyId" = c.id AND h.module = 'INVENTORY') = false
            THEN 'has no Stock levels (INVENTORY) either' ELSE '' END AS note
FROM usage u
JOIN "Company" c ON c.id = u."companyId"
WHERE c."internalCode" <> 'BLACK_ROCK_EQUIPMENT'
  AND NOT EXISTS (SELECT 1 FROM have h WHERE h."companyId" = u."companyId" AND h.module::text = u.module)
ORDER BY c."internalCode", u.module;
