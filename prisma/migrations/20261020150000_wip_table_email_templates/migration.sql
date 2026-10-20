-- User request: "add a button on the job wip table next to print called Email ... add template fields to customize the email sent".
-- Editable subject and message for the email sent by that button. Nullable: a company that never edits them gets the default text
-- (see DEFAULT_WIP_SUBJECT / DEFAULT_WIP_BODY in src/lib/email-templates.ts). The signature reuses the existing emailSignature column.
ALTER TABLE "CompanySettings" ADD COLUMN "wipEmailSubject" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "wipEmailBody" TEXT;
