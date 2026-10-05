-- AlterTable
ALTER TABLE "JobPartLine" ADD COLUMN     "orderedQuantity" DECIMAL(19,4),
ADD COLUMN     "stockIssuedQuantity" DECIMAL(19,4);

-- Backfill: pick slips made before this change already took their stock off
-- the shelf at pick time (each PickSlipLine carries the ISSUE movement's id),
-- so count those units as already issued. Otherwise "Mark received" would
-- deduct them a second time.
UPDATE "JobPartLine" AS l
SET "stockIssuedQuantity" = s."issued"
FROM (
  SELECT "jobPartLineId", SUM("quantity") AS "issued"
  FROM "PickSlipLine"
  WHERE "jobPartLineId" IS NOT NULL AND "stockMovementId" IS NOT NULL
  GROUP BY "jobPartLineId"
) AS s
WHERE l."id" = s."jobPartLineId";
