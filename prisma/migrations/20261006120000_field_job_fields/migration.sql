-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "siteContactName" TEXT,
ADD COLUMN     "siteContactPhone" TEXT,
ADD COLUMN     "siteAddress" TEXT,
ADD COLUMN     "accessNotes" TEXT;

-- AlterTable
ALTER TABLE "JobFieldServiceReport" ADD COLUMN     "scheduledDate" DATE,
ADD COLUMN     "hoursNormal" DECIMAL(19,4),
ADD COLUMN     "hoursOvertime" DECIMAL(19,4),
ADD COLUMN     "hoursTravelled" DECIMAL(19,4),
ADD COLUMN     "findings" TEXT,
ADD COLUMN     "workDone" TEXT,
ADD COLUMN     "recommendations" TEXT,
ADD COLUMN     "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpDate" DATE;

-- Existing field reports kept a single "Hours" figure: carry it into normal
-- time so nothing is lost and the total stays the same.
UPDATE "JobFieldServiceReport" SET "hoursNormal" = "hours" WHERE "hours" IS NOT NULL;

-- AlterTable
ALTER TABLE "JobAttachment" ADD COLUMN     "tag" TEXT;
