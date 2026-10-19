-- Landing page "Request a demo" enquiries, shown under Platform > Demo Requests (New / History).
CREATE TYPE "DemoRequestStatus" AS ENUM ('NEW', 'HISTORY');

CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "businessType" TEXT,
    "message" TEXT,
    "status" "DemoRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedToHistoryAt" TIMESTAMP(3),
    "movedToHistoryBy" TEXT,
    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoRequest_status_createdAt_idx" ON "DemoRequest"("status", "createdAt");
