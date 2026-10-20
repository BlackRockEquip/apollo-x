-- Platform > Proposals (2026-10-21)
ALTER TABLE "PlatformSettings" ADD COLUMN "proposalPriceList" JSONB;

CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');

CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "demoRequestId" TEXT,
    "clientCompany" TEXT NOT NULL,
    "contactName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "data" JSONB NOT NULL,
    "onceOffTotal" DECIMAL(14,2) NOT NULL,
    "monthlyTotal" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proposal_number_key" ON "Proposal"("number");
CREATE INDEX "Proposal_status_createdAt_idx" ON "Proposal"("status", "createdAt");
CREATE INDEX "Proposal_demoRequestId_idx" ON "Proposal"("demoRequestId");

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_demoRequestId_fkey" FOREIGN KEY ("demoRequestId") REFERENCES "DemoRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
