cd "C:\Projects\Apollo X Working"
# Read-only check (changes nothing): which companies already hold parts, outwork, RFQ, pick-slip,
# field-service or PEX records without the matching module? They will no longer be able to add or
# edit those once Industry builds step B is live (existing records stay in the database).
# Black Rock is skipped. Uses the database in your .env (DATABASE_URL).
@'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(`
WITH have AS (
  SELECT "companyId", "module"::text AS module FROM "CompanyModuleEntitlement" WHERE "product" = 'WORKSHOP'
),
usage AS (
  SELECT "companyId", 'JOB_PARTS' AS module, count(*) AS records FROM "JobPartLine" GROUP BY 1
  UNION ALL SELECT "companyId", 'OUTWORK', count(*) FROM "OutworkItem" GROUP BY 1
  UNION ALL SELECT "companyId", 'PROCUREMENT', count(*) FROM "JobRfqRequest" GROUP BY 1
  UNION ALL SELECT "companyId", 'PICK_SLIPS', count(*) FROM "PickSlip" GROUP BY 1
  UNION ALL SELECT "companyId", 'FIELD_SERVICE', count(*) FROM "Job" WHERE "type" = 'FIELD_SERVICE' GROUP BY 1
  UNION ALL SELECT "companyId", 'PEX_STOCK', count(*) FROM "Job" WHERE "type" IN ('PEX_SUPPLY', 'PEX_RETURN') GROUP BY 1
)
SELECT c."internalCode" AS company, c."legalName" AS name, u.module, u.records::int AS records,
       CASE WHEN u.module = 'PICK_SLIPS' AND NOT EXISTS (SELECT 1 FROM have h WHERE h."companyId" = c.id AND h.module = 'INVENTORY')
            THEN 'also has no Stock levels' ELSE '' END AS note
FROM usage u
JOIN "Company" c ON c.id = u."companyId"
WHERE c."internalCode" <> 'BLACK_ROCK_EQUIPMENT'
  AND NOT EXISTS (SELECT 1 FROM have h WHERE h."companyId" = u."companyId" AND h.module = u.module)
ORDER BY c."internalCode", u.module`);
if (rows.length === 0) console.log("No company is affected."); else console.table(rows);
await prisma.$disconnect();
'@ | Set-Content -Path check-affected.tmp.mjs -Encoding UTF8
node --env-file=.env check-affected.tmp.mjs
Remove-Item check-affected.tmp.mjs
