-- Marks the copy of a supplier's quote file kept in a job's Attachments, so importing a new file for the
-- same supplier can replace it.
ALTER TABLE "JobAttachment" ADD COLUMN "rfqRequestId" TEXT;
CREATE INDEX "JobAttachment_rfqRequestId_idx" ON "JobAttachment"("rfqRequestId");
