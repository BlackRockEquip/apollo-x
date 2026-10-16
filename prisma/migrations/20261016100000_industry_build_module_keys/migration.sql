-- Industry builds, step A: new module keys and the per-company build setting.
-- (The new enum values are not used in this file; the data fix-up that uses
-- them is the next migration, so each runs in its own transaction.)

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'JOB_PARTS';
ALTER TYPE "ModuleKey" ADD VALUE 'PICK_SLIPS';
ALTER TYPE "ModuleKey" ADD VALUE 'SPECIFICATIONS';

-- CreateEnum
CREATE TYPE "IndustryBuild" AS ENUM ('WORKSHOP', 'ENGINEERING');

-- AlterTable: every existing company (Black Rock included) is a Workshop company.
ALTER TABLE "Company" ADD COLUMN "industryBuild" "IndustryBuild" NOT NULL DEFAULT 'WORKSHOP';
