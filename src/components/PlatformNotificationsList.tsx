"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell } from "lucide-react";

// 2026-10-01 — Platform Admin's own /platform/notifications page, the
// same shape as NotificationsList.tsx (no dismiss/History split here — the
// volume is low enough, support-escalation only, that it wasn't worth the
// extra schema/UI for this side too).
type PlatformNotificationRow = { id: string; type: string; title: string; message: string; link: string | null; readAt: string | null; createdAt: string };

export function PlatformNotificationsList({ initialItems, initialUnreadCount }: { initialItems: PlatformNotificationRow[]; initialUnreadCount: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);

  async function markRead(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target || target.readAt) return;
    setItems((current) => current.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/v1/platform/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Best-effort — a failed mark-read just leaves it showing unread
      // again next time the page loads.
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setItems((current) => current.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch("/api/v1/platform/notifications/read-all", { method: "POST" });
    } catch {
      // Best-effort, same as markRead above.
    } finally {
      setMarkingAll(false);
    }
  }

  function openNotification(item: PlatformNotificationRow) {
    void markRead(item.id);
    if (item.link) router.push(item.link);
  }

  return (
    <section className="detail-panel">
      <header>
        <div><h2>All notifications</h2><p>{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}</p></div>
        {unreadCount > 0 && <button type="button" className="quiet-button" disabled={markingAll} onClick={() => void markAllRead()}>Mark all read</button>}
      </header>
      <div className="history-list">
        {items.map((item) => (
          <article key={item.id} className={item.readAt ? undefined : "notification-unread"} style={{ cursor: item.link ? "pointer" : "default" }} onClick={() => openNotification(item)}>
            <strong>{item.title}</strong>
            <span>{item.message}</span>
            <time>{new Date(item.createdAt).toLocaleString("en-ZA")}</time>
          </article>
        ))}
        {items.length === 0 && <p className="table-state compact-empty-state"><Bell size={16} /> No notifications yet.</p>}
      </div>
    </section>
  );
}
