"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async user loading intentionally mirrors existing workspace patterns */
import { useEffect, useMemo, useState } from "react";
import { Megaphone, Send } from "lucide-react";

type UserOption = { id: string; email: string; displayName: string };

// 2026-10-01 — user request: "Allow a Org Admin to send out a message to
// all users/individual users (Notification banner that popsup)." Originally
// embedded as a third tab inside UsersWorkspace.tsx; moved to its own
// Settings destination (/settings/broadcast — see settings-nav.ts and that
// page) per a follow-up request so it isn't buried inside the Users tab
// strip. No longer handed a `users` list by a parent — it loads its own via
// GET /api/v1/users (the same endpoint UsersWorkspace.tsx itself uses) now
// that it's not guaranteed to be rendered alongside that workspace. Posts
// to /api/v1/notifications/broadcast (sendCompanyBroadcast), which
// re-checks USERS_MANAGE itself regardless of this page's own gating.
//
// 2026-10-01 — user report: "broadcasting to specific users does not
// work, error could not be completed thrown, works when sending to all."
// Root cause: GET /api/v1/users (listTenantUsers in users/service.ts)
// returns each row's `id` as the CompanyMembership id, with the real User
// id in a separate `userId` field (membershipId is what UsersWorkspace.tsx
// needs for its own edit/delete actions) — this component was reading
// `u.id` for a recipient's id and posting that. sendCompanyBroadcast
// (notifications/service.ts) validates "individual" recipients against
// each active membership's `userId`, so every selected recipient failed
// that check — targetIds ended up empty, which throws "No valid
// recipients were selected." "All" mode never hit this: it skips the
// per-id filter and just sends to every active member's userId directly,
// which is why only "All" worked. Fixed by keying UserOption off `userId`
// instead of `id` below.
export function BroadcastComposer() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [mode, setMode] = useState<"all" | "individual">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/v1/users", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Unable to load users.");
        if (!cancelled) setUsers((body.users || []).map((u: { userId: string; email: string; displayName: string }) => ({ id: u.userId, email: u.email, displayName: u.displayName })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load users.");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const canSend = title.trim().length > 0 && message.trim().length > 0 && (mode === "all" || selected.size > 0);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    setSending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/notifications/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, message, recipients: mode === "all" ? "all" : [...selected] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to send this message.");
      setNotice(`Sent to ${body.sentTo} user${body.sentTo === 1 ? "" : "s"}.`);
      setTitle(""); setMessage(""); setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send this message.");
    } finally {
      setSending(false);
    }
  }

  const sorted = useMemo(() => [...users].sort((a, b) => a.displayName.localeCompare(b.displayName)), [users]);

  return (
    <div className="platform-grid">
      <section className="detail-panel">
        <header>
          <div><h2><Megaphone size={15} /> Broadcast message</h2><p className="muted small-line">Sent as a popup banner (plus a regular notification) to every recipient, next time they're on a page.</p></div>
          <div className="header-actions"><button type="button" className="gold-button" disabled={sending || !canSend} onClick={() => void send()}><Send size={14} /> {sending ? "Sending…" : "Send"}</button></div>
        </header>
        {error ? <div className="inline-error">{error}</div> : null}
        {notice ? <div className="inline-success">{notice}</div> : null}
        <div className="drawer-fields compact-form-fields">
          <label><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Planned maintenance tonight" /></label>
          <label><span>Send to</span><select value={mode} onChange={(e) => setMode(e.target.value as "all" | "individual")}><option value="all">All users</option><option value="individual">Specific users</option></select></label>
          <label className="wide"><span>Message</span><textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        </div>
      </section>
      {mode === "individual" && (
        <section className="detail-panel">
          <header><div><h2>Recipients</h2><p className="muted small-line">{selected.size} selected</p></div></header>
          {usersLoading ? <div className="table-state">Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th></th><th>Name</th><th>Email</th></tr></thead><tbody>
            {sorted.map((u) => <tr key={u.id}><td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td><td><strong>{u.displayName}</strong></td><td>{u.email}</td></tr>)}
            {sorted.length === 0 && <tr><td colSpan={3} className="table-state compact-empty-state">No users to message yet.</td></tr>}
          </tbody></table></div>}
        </section>
      )}
    </div>
  );
}
