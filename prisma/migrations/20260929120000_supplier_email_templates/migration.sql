-- User request: "Create a template tab under settings which allows me to
-- edit the message/email sent to suppliers, add/edit a signature field,
-- change sending from email address etc." Adds editable subject/body
-- templates for the RFQ-request and parts-follow-up supplier emails, plus
-- a shared signature. All columns are nullable and default to NULL, so an
-- existing company that never opens the new Templates tab keeps sending
-- the exact same hardcoded text it does today (see the DEFAULT_* constants
-- in src/lib/email-templates.ts) -- nothing changes until they explicitly
-- customize something. The "from" address/name are NOT duplicated here --
-- they stay on the existing smtpFromAddress/smtpFromName columns, since
-- that's SMTP transport configuration rather than message content.
ALTER TABLE "CompanySettings" ADD COLUMN "rfqEmailSubject" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "rfqEmailBody" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "followupEmailSubject" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "followupEmailBody" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "emailSignature" TEXT;
