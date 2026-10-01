"use client";

import { useMemo, useState } from "react";
import { Megaphone, Send } from "lucide-react";

type UserOption = { id: string; email: string; displayName: string };

// 2026-10-01 — user request: "Allow a Org Admin to send out a message to
// all users/individual users (Notification banner that popsup)." Embedded
// as a third tab in UsersWorkspace.tsx (its page is already USERS_MANAGE-
// gated — COMPANY_ADMIN-only by default, matching "Org Admin" — see
// users/page.tsx), reusing the user list that workspace already loads
// rather than fetching its own. Posts to /api/v1/notifications/broadcast
// (sendCompanyBroadcast), which re-checks USERS_MANAGE itself regardless
// of this page's own gating.
export function BroadcastComposer({ users }: { users: UserOption[] }) {
  const [mode, setMode] = useState<"all" | "individual">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th></th><th>Name</th><th>Email</th></tr></thead><tbody>
            {sorted.map((u) => <tr key={u.id}><td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td><td><strong>{u.displayName}</strong></td><td>{u.email}</td></tr>)}
            {sorted.length === 0 && <tr><td colSpan={3} className="table-state compact-empty-state">No users to message yet.</td></tr>}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
