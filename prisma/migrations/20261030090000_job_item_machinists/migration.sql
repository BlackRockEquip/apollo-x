-- Engineering multi-item jobs: each item can have its own Machinist 'Assess' / 'Final'. NULL = the item follows the job's machinist,
-- so nothing existing is backfilled or changed.
ALTER TABLE "JobItem" ADD COLUMN "stripMechanicId" TEXT;
ALTER TABLE "JobItem" ADD COLUMN "buildMechanicId" TEXT;

CREATE INDEX "JobItem_stripMechanicId_idx" ON "JobItem"("stripMechanicId");
CREATE INDEX "JobItem_buildMechanicId_idx" ON "JobItem"("buildMechanicId");

ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_stripMechanicId_fkey" FOREIGN KEY ("stripMechanicId") REFERENCES "Mechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_buildMechanicId_fkey" FOREIGN KEY ("buildMechanicId") REFERENCES "Mechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
