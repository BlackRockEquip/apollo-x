-- User request: "on stock levels, how can we add additional part numbers
-- for parts that have superseded numbers and also have group numbers, so
-- basically two different numbers but have multiple entries?" A part can
-- now carry any number of alternate numbers (a superseded number it used
-- to be known by, or a broader group/family number) that resolve back to
-- the SAME Part record -- same stock, same bin, same history -- rather
-- than creating a duplicate Part per number. See the PartAlternateNumber
-- model comment in schema.prisma and findPartByNumber in
-- src/lib/inventory/parts-lookup.ts.
CREATE TYPE "PartAlternateNumberKind" AS ENUM ('SUPERSEDED', 'GROUP');

CREATE TABLE "PartAlternateNumber" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "numberNormalized" TEXT NOT NULL,
    "kind" "PartAlternateNumberKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartAlternateNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartAlternateNumber_companyId_numberNormalized_key" ON "PartAlternateNumber"("companyId", "numberNormalized");

CREATE INDEX "PartAlternateNumber_companyId_partId_idx" ON "PartAlternateNumber"("companyId", "partId");

ALTER TABLE "PartAlternateNumber" ADD CONSTRAINT "PartAlternateNumber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartAlternateNumber" ADD CONSTRAINT "PartAlternateNumber_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
