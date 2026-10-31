-- User request: "add fields on the template for emails to be cc'd". Each email template (quote request, parts follow-up, Jobs & WIP
-- table email) can list addresses that are copied on every email sent from it. Nullable, so nothing changes for a company that
-- never fills it in.
ALTER TABLE "CompanySettings" ADD COLUMN "rfqEmailCc" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "followupEmailCc" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "wipEmailCc" TEXT;
