-- Mechanic view (2026-10-27):
-- 1) A mechanic can request a picking slip for in-stock parts; a store controller / manager / admin creates it or declines.
-- 2) Job files are split into Photos and Attachments: JobAttachment.isPhoto. Existing image files become photos
--    (supplier quote copies are never photos).

ALTER TYPE "NotificationType" ADD VALUE 'PICK_SLIP_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PICK_SLIP_REQUEST_HANDLED';

CREATE TYPE "PickSlipRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'DECLINED');

CREATE TABLE "PickSlipRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "PickSlipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "declineReason" TEXT,
    "pickSlipId" TEXT,

    CONSTRAINT "PickSlipRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickSlipRequest_companyId_status_createdAt_idx" ON "PickSlipRequest"("companyId", "status", "createdAt");
CREATE INDEX "PickSlipRequest_jobId_idx" ON "PickSlipRequest"("jobId");

ALTER TABLE "PickSlipRequest" ADD CONSTRAINT "PickSlipRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickSlipRequest" ADD CONSTRAINT "PickSlipRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickSlipRequest" ADD CONSTRAINT "PickSlipRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PickSlipRequest" ADD CONSTRAINT "PickSlipRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PickSlipRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "PickSlipRequestLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickSlipRequestLine_requestId_idx" ON "PickSlipRequestLine"("requestId");
CREATE INDEX "PickSlipRequestLine_partId_idx" ON "PickSlipRequestLine"("partId");

ALTER TABLE "PickSlipRequestLine" ADD CONSTRAINT "PickSlipRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PickSlipRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickSlipRequestLine" ADD CONSTRAINT "PickSlipRequestLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobAttachment" ADD COLUMN "isPhoto" BOOLEAN NOT NULL DEFAULT false;
UPDATE "JobAttachment" SET "isPhoto" = true WHERE "mimeType" LIKE 'image/%' AND "rfqRequestId" IS NULL;
