-- Outbound RFQ attachments — added 2026-09-14 at the user's request ("add
-- attachment to RFQ field, the same when sending RFQs in jobs, an
-- attachment can be sent with"). Distinct from JobRfqQuote.data (the
-- supplier's quote file coming back in) — these columns hold a file
-- attached when SENDING the RFQ out (a drawing, spec sheet or photo),
-- inline Bytes, same convention as JobAttachment/JobRfqQuote.
ALTER TABLE "JobRfqRequest" ADD COLUMN     "attachmentFileName" TEXT,
ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentSizeBytes" INTEGER,
ADD COLUMN     "attachmentData" BYTEA;

ALTER TABLE "GeneralRfqRequest" ADD COLUMN     "attachmentFileName" TEXT,
ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentSizeBytes" INTEGER,
ADD COLUMN     "attachmentData" BYTEA;
