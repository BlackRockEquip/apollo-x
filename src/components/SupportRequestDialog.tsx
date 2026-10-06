"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Headset, Send, X } from "lucide-react";

// 2026-10-01 — user request: "when clicking the support button, nothing
// happens, make it that every user that clicks support except Org Admins,
// a dialog popsup for the user to fill in what are the problems/support
// required, then a notification gets sent to Org Admins, if Org Admins
// click support then it should go to System Admin, a proper system flow."
//
// A full support-ticket system already existed (SupportWorkspace.tsx, the
// /support page under Settings) — clicking Support in the topbar just
// linked straight there with no prompt, which read as "nothing happens"
// for someone expecting a quick way to flag a problem. This is that quick
// dialog: a condensed version of SupportWorkspace's own "Log an issue"
// fields, posted to the same /api/v1/support endpoint, so every ticket
// still ends up in the same place (Settings → Support, and the Platform
// Admin support queue) — just reachable without leaving the page first. The
// recipient-routing (Org Admins vs. System/Platform Admins, depending on
// who's reporting) happens server-side in createSupportTicket
// (support/service.ts), not here — this dialog doesn't need to know or
// care which the signed-in user is.
//
// Rendered from AppShell.tsx's topbar, same backdrop-filter containing-
// block issue ChangePasswordButton.tsx hit (see its own comment) — ported
// through a portal here too, for the same reason.

// A response that is not JSON means the request never reached the Support
// code: the sign-in expired (the proxy redirects to the login page), or the
// server was restarting / returned its own error page. Say that instead of
// "Unexpected token '<'".
async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (response.redirected && /\/login/.test(response.url)) throw new Error("Your sign-in has expired. Please sign in again, then resubmit.");
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}). If the app was just updated it may still be restarting - wait a minute and try again.`);
  }
}

export function SupportRequestDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "", priority: "NORMAL" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function close() {
    setOpen(false);
    setForm({ subject: "", description: "", category: "", priority: "NORMAL" });
    setError("");
    setSent(false);
  }

  async function submit() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "content-type": "application/json", "x-apollo-route": window.location.pathname },
        body: JSON.stringify({ ...form, moduleKey: null, pageRoute: window.location.pathname, attachments: [] }),
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error?.message || "Unable to submit your request.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit your request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="table-action" onClick={() => setOpen(true)}><Headset size={14} /> Support</button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <aside className="form-drawer compact-dialog" aria-modal="true">
            <header>
              <div><p className="eyebrow">Support</p><h2>{sent ? "Request sent" : "What's the problem?"}</h2></div>
              <button aria-label="Close" onClick={close}><X size={18} /></button>
            </header>
            {sent ? (
              <div className="drawer-body">
                <p>Thanks — your request has been logged and the right people have been notified. You can track its status any time under Settings → Support.</p>
                <div className="header-actions"><button type="button" className="gold-button" onClick={close}>Done</button></div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="drawer-body">
                {error ? <div className="inline-error">{error}</div> : null}
                <label><span>Subject</span><input required minLength={3} value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))} placeholder="Short summary" /></label>
                <label><span>Category (optional)</span><input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} /></label>
                <label>
                  <span>Priority</span>
                  <select value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value }))}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <label><span>Describe the problem/support required</span><textarea rows={5} required minLength={8} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></label>
                <p className="hint-text">For attachments or to follow up on an existing request, use Settings → Support.</p>
                <div className="header-actions">
                  <button type="button" className="quiet-button" onClick={close}>Cancel</button>
                  <button type="submit" className="gold-button" disabled={saving || form.subject.trim().length < 3 || form.description.trim().length < 8}><Send size={14} /> {saving ? "Sending…" : "Submit"}</button>
                </div>
              </form>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
