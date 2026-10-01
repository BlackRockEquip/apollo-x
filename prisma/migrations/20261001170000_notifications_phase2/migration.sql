-- User requests (2026-10-01 batch):
-- "once notifications is there, allow a user to remove the notification
-- which would move it to a History tab" — Notification.dismissedAt.
-- "when clicking the support button... a notification gets sent to Org
-- Admins, if Org Admins click support then it should go to System Admin" —
-- NotificationType.SUPPORT_TICKET_CREATED (tenant side) and the new
-- platform-side PlatformNotification model (System/Platform Admin side).
-- "Allow a Org Admin to send out a message to all users/individual users
-- (Notification banner that popsup)" — NotificationType.ORG_BROADCAST.

ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_TICKET_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'ORG_BROADCAST';

ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- Active-tab / History-tab split — the other query NotificationsList.tsx
-- makes on every /notifications page load, alongside the existing
-- unread-count index.
CREATE INDEX "Notification_companyId_userId_dismissedAt_idx" ON "Notification"("companyId", "userId", "dismissedAt");

CREATE TYPE "PlatformNotificationType" AS ENUM ('SUPPORT_TICKET_ESCALATED');

CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PlatformNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformNotification_userId_readAt_idx" ON "PlatformNotification"("userId", "readAt");

ALTER TABLE "PlatformNotification" ADD CONSTRAINT "PlatformNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
