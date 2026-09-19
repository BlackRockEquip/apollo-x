-- User request: "notifications move to icon next to the support link at
-- the top of page, always visible from every page, once clicked will have
-- its own page that a user can view all notifications" plus "when users
-- load part list onto system, notification should be sent to
-- admins/managers." No Notification model existed at all before this — see
-- the Notification model comment in schema.prisma for the shape (one row
-- per recipient, so each admin/manager has their own independent read
-- state).
CREATE TYPE "NotificationType" AS ENUM ('PARTS_LIST_IMPORTED');

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Fastest for the always-visible bell badge's unread-count query
-- (companyId, userId, readAt IS NULL) on every single page load.
CREATE INDEX "Notification_companyId_userId_readAt_idx" ON "Notification"("companyId", "userId", "readAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
