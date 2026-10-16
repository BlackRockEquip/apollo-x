-- Job kit lines get their own part number / description so a kit does not need the Stock levels parts catalog.
-- partId becomes optional (it is only set when the line is linked to a catalog part).
ALTER TABLE "JobKitLine" ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "JobKitLine" ADD COLUMN "partNumber" TEXT;
ALTER TABLE "JobKitLine" ADD COLUMN "description" TEXT;

-- Existing lines keep working exactly as before: copy the catalog values onto the line.
UPDATE "JobKitLine" l
SET "partNumber" = p."partNumber", "description" = p."description"
FROM "Part" p
WHERE p."id" = l."partId";
