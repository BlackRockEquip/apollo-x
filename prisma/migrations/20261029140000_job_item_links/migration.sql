-- Engineering multi-item jobs: tie parts, outwork, photos / attachments and specification reports to one item of the job.
-- Nullable: null means the whole job, which is what every existing row is, so nothing is backfilled or changed.
-- Removing an item clears the link (the record stays on the job).
ALTER TABLE "JobPartLine" ADD COLUMN "itemId" TEXT;
ALTER TABLE "OutworkItem" ADD COLUMN "itemId" TEXT;
ALTER TABLE "JobAttachment" ADD COLUMN "itemId" TEXT;
ALTER TABLE "JobDimensionReport" ADD COLUMN "itemId" TEXT;

CREATE INDEX "JobPartLine_companyId_itemId_idx" ON "JobPartLine"("companyId", "itemId");
CREATE INDEX "OutworkItem_companyId_itemId_idx" ON "OutworkItem"("companyId", "itemId");
CREATE INDEX "JobAttachment_companyId_itemId_idx" ON "JobAttachment"("companyId", "itemId");
CREATE INDEX "JobDimensionReport_companyId_itemId_idx" ON "JobDimensionReport"("companyId", "itemId");

ALTER TABLE "JobPartLine" ADD CONSTRAINT "JobPartLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutworkItem" ADD CONSTRAINT "OutworkItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobAttachment" ADD CONSTRAINT "JobAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobDimensionReport" ADD CONSTRAINT "JobDimensionReport_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "JobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
