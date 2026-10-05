-- 2026-10-05: files move out of the database into the company's chosen storage.
-- The bytes columns become nullable; storedAttachmentId points at Attachment.id.
ALTER TABLE "JobAttachment" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "JobAttachment" ADD COLUMN "storedAttachmentId" TEXT;
ALTER TABLE "SupportTicketAttachment" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "SupportTicketAttachment" ADD COLUMN "storedAttachmentId" TEXT;
ALTER TABLE "JobRfqQuote" ADD COLUMN "storedAttachmentId" TEXT;
ALTER TABLE "JobRfqRequest" ADD COLUMN "storedAttachmentId" TEXT;
ALTER TABLE "GeneralRfqRequest" ADD COLUMN "storedAttachmentId" TEXT;

-- Org Admin > Configuration > Document titles
ALTER TABLE "CompanySettings" ADD COLUMN "documentTitles" JSONB;
