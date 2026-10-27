-- User request (Compare quotes): an Availability column showing the supplier's lead time for each part.
-- Free text on the quote line ("In stock", "7 days", "10-14 days"); empty when the supplier gave none.
ALTER TABLE "JobRfqQuoteLine" ADD COLUMN "leadTime" TEXT;
