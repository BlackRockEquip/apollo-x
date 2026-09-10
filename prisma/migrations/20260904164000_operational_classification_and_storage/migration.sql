-- classify operational vs historical/import-only records safely
CREATE TYPE "PartOperationalStatus" AS ENUM ('OPERATIONAL', 'HISTORICAL_REFERENCE');
ALTER TABLE "Part" ADD COLUMN "operationalStatus" "PartOperationalStatus" NOT NULL DEFAULT 'OPERATIONAL';

CREATE TYPE "StorageOperationalStatus" AS ENUM ('OPERATIONAL', 'INTERNAL_ONLY');
ALTER TABLE "StorageLocation" ADD COLUMN "operationalStatus" "StorageOperationalStatus" NOT NULL DEFAULT 'OPERATIONAL';