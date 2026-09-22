"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, X } from "lucide-react";

// 2026-09-22, user request: "Allow users to reset there own password."
// Used from both AppShell.tsx (tenant topbar) and PlatformShell.tsx
// (platform-admin topbar) — self-service password change has no
// permission gate of its own (see account/service.ts's changeOwnPassword),
// so it belongs next to Logout in either shell rather than tucked inside
// one specific settings page. A successful change revokes every session
// (this one included, per changeOwnPassword) and clears the cookie
// server-side, so this redirects straight to /login afterwards rather
// than trying to keep the current page alive with a now-dead session.
export function ChangePasswordButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setOpen(false);
    setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setError("");
  }

  async function submit() {
    if (form.newPassword !== form.confirmPassword) { setError("New password and confirmation don't match."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/account/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to change password.");
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change password.");
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="table-action" onClick={() => setOpen(true)}><KeyRound size={14} /> Change password</button>
      {open && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <aside className="form-drawer" aria-modal="true">
            <header>
              <div><p className="eyebrow">Account</p><h2>Change password</h2></div>
              <button aria-label="Close" onClick={close}><X size={18} /></button>
            </header>
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="drawer-body">
              {error ? <div className="inline-error">{error}</div> : null}
              <label><span>Current password</span><input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm((c) => ({ ...c, currentPassword: e.target.value }))} /></label>
              <label><span>New password</span><input type="password" autoComplete="new-password" required minLength={8} value={form.newPassword} onChange={(e) => setForm((c) => ({ ...c, newPassword: e.target.value }))} /></label>
              <label><span>Confirm new password</span><input type="password" autoComplete="new-password" required minLength={8} value={form.confirmPassword} onChange={(e) => setForm((c) => ({ ...c, confirmPassword: e.target.value }))} /></label>
              <p className="hint-text">You'll be signed out of every device and need to sign in again with your new password.</p>
              <div className="header-actions">
                <button type="button" className="quiet-button" onClick={close}>Cancel</button>
                <button type="submit" className="gold-button" disabled={saving || form.currentPassword.length < 1 || form.newPassword.length < 8}><Save size={14} /> {saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
