-- An organisation's "delete ticket" now hides the ticket from that organisation only;
-- Platform support keeps the ticket and its history.
ALTER TABLE "SupportTicket" ADD COLUMN "tenantDeletedAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "tenantDeletedById" TEXT;
