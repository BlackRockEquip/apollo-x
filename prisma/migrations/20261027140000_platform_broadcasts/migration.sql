-- Platform > Broadcasts (2026-10-27)
ALTER TYPE "NotificationType" ADD VALUE 'PLATFORM_BROADCAST';

CREATE TYPE "PlatformBroadcastKind" AS ENUM ('INFORMATION', 'IMPORTANT', 'MAINTENANCE');

CREATE TYPE "PlatformBroadcastAudience" AS ENUM ('ALL', 'COMPANIES', 'USERS');

CREATE TABLE "PlatformBroadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "kind" "PlatformBroadcastKind" NOT NULL DEFAULT 'INFORMATION',
    "audience" "PlatformBroadcastAudience" NOT NULL,
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "requireAck" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "companyCount" INTEGER NOT NULL DEFAULT 0,
    "emailedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformBroadcast_createdAt_idx" ON "PlatformBroadcast"("createdAt");

CREATE INDEX "PlatformBroadcast_deliveredAt_withdrawnAt_startsAt_idx" ON "PlatformBroadcast"("deliveredAt", "withdrawnAt", "startsAt");

ALTER TABLE "Notification" ADD COLUMN "broadcastId" TEXT;

CREATE INDEX "Notification_broadcastId_idx" ON "Notification"("broadcastId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "PlatformBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
