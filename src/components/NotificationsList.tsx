"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, History, X } from "lucide-react";
import { NotificationSoundSettings } from "@/components/NotificationSoundSettings";

// 2026-09-19 — the "own page that a user can view all notifications" from
// the bell icon request (see NotificationBell.tsx / the notifications
// page). Client component so clicking a notification can mark it read
// (and follow its link, if any) without a full page reload, and so "Mark
// all read" can update the list in place.
type NotificationRow = { id: string; type: string; title: string; message: string; link: string | null; readAt: string | null; createdAt: string };

// 2026-10-01 — user request: "once notifications is there, allow a user to
// remove the notification which would move it to a History tab." The
// server (notifications/service.ts's listNotifications) already splits
// active vs. history by dismissedAt, so the page passes down both lists
// and this just switches which one is shown — no extra fetch on tab
// switch.
export function NotificationsList({ initialItems, initialUnreadCount, initialHistoryItems }: { initialItems: NotificationRow[]; initialUnreadCount: number; initialHistoryItems: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [historyItems, setHistoryItems] = useState(initialHistoryItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [dismissingId, setDismissingId] = useState("");

  async function markRead(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target || target.readAt) return;
    setItems((current) => current.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Best-effort — a failed mark-read just leaves it showing unread
      // again next time the page loads; nothing else depends on it.
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setItems((current) => current.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch("/api/v1/notifications/read-all", { method: "POST" });
    } catch {
      // Best-effort, same as markRead above.
    } finally {
      setMarkingAll(false);
    }
  }

  async function dismiss(item: NotificationRow, e: React.MouseEvent) {
    e.stopPropagation();
    setDismissingId(item.id);
    const dismissedAt = new Date().toISOString();
    setItems((current) => current.filter((i) => i.id !== item.id));
    setHistoryItems((current) => [{ ...item, readAt: item.readAt ?? dismissedAt }, ...current]);
    if (!item.readAt) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/v1/notifications/${item.id}/dismiss`, { method: "POST" });
    } catch {
      // Best-effort — a failed dismiss just leaves it showing active again
      // next time the page loads.
    } finally {
      setDismissingId("");
    }
  }

  function openNotification(item: NotificationRow) {
    void markRead(item.id);
    if (item.link) router.push(item.link);
  }

  const visibleItems = tab === "active" ? items : historyItems;

  return (
    <>
      <section className="detail-panel">
        <header>
          <div><h2>All notifications</h2><p>{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}</p></div>
          {tab === "active" && unreadCount > 0 && <button type="button" className="quiet-button" disabled={markingAll} onClick={() => void markAllRead()}>Mark all read</button>}
        </header>
        <div className="tab-strip">
          <button type="button" className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>Active ({items.length})</button>
          <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><History size={13} /> History ({historyItems.length})</button>
        </div>
        <div className="history-list notifications-history-list">
          {visibleItems.map((item) => (
            <article key={item.id} className={item.readAt ? undefined : "notification-unread"} style={{ cursor: item.link ? "pointer" : "default" }} onClick={() => openNotification(item)}>
              <strong>{item.title}</strong>
              <span>{item.message}</span>
              <time>{new Date(item.createdAt).toLocaleString("en-ZA")}</time>
              {tab === "active" && <button type="button" className="table-action" title="Remove — moves to History" aria-label="Remove notification" disabled={dismissingId === item.id} onClick={(e) => void dismiss(item, e)}><X size={13} /> Remove</button>}
            </article>
          ))}
          {visibleItems.length === 0 && (
            <p className="table-state compact-empty-state">
              <Bell size={16} /> {tab === "active" ? "No notifications yet." : "No removed notifications yet."}
            </p>
          )}
        </div>
      </section>
      <NotificationSoundSettings />
    </>
  );
}
