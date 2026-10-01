import { requireRequestContext } from "@/lib/auth/session";
import { listPlatformNotifications } from "@/lib/platform/notifications";
import { PlatformNotificationsList } from "@/components/PlatformNotificationsList";

export const dynamic = "force-dynamic";

// 2026-10-01 — user request: "when clicking the support button... if Org
// Admins click support then it should go to System Admin, a proper system
// flow." Platform-side equivalent of /notifications — see
// lib/platform/notifications.ts for who gets notified (every active
// platform role holder with PLATFORM_SUPPORT_READ) and when (an Org
// Admin's own support ticket).
export default async function PlatformNotificationsPage() {
  const ctx = await requireRequestContext();
  const { items, unreadCount } = await listPlatformNotifications(ctx, { take: 200 });
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Notifications</h1><p>Support tickets raised by Org Admins, escalated straight to platform staff.</p></div>
      </header>
      <PlatformNotificationsList
        initialItems={items.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, link: n.link, readAt: n.readAt ? n.readAt.toISOString() : null, createdAt: n.createdAt.toISOString() }))}
        initialUnreadCount={unreadCount}
      />
    </div>
  );
}
