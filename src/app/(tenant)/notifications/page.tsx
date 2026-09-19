import { requireRequestContext } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/service";
import { NotificationsList } from "@/components/NotificationsList";

export const dynamic = "force-dynamic";

// 2026-09-19 — the "own page that a user can view all notifications" from
// the bell-icon request (see NotificationBell.tsx). No module/permission
// gate beyond being signed in to a company (same as /support) — see
// notifications/service.ts's own comment for why: every notification here
// is already scoped to the signed-in user themselves.
export default async function NotificationsPage() {
  const ctx = await requireRequestContext();
  const { items, unreadCount } = await listNotifications(ctx, { take: 200 });
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Notifications</p><h1>Notifications</h1><p>Everything sent to you — click one to open what it's about.</p></div>
      </header>
      <NotificationsList
        initialItems={items.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, link: n.link, readAt: n.readAt ? n.readAt.toISOString() : null, createdAt: n.createdAt.toISOString() }))}
        initialUnreadCount={unreadCount}
      />
    </div>
  );
}
