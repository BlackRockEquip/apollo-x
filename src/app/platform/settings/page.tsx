"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async platform settings loading intentionally mirrors existing workspace patterns */
import { useEffect, useState } from "react";
import { Save } from "lucide-react";

// 2026-09-22 — new page behind the "Platform Settings" nav item, which
// previously pointed nowhere real (see PlatformShell.tsx's own comment).
// Only one setting exists so far: the platform-wide SMTP sender used for
// password-reset emails (PlatformSettings model — see its schema.prisma
// comment for why this is separate from any one company's own SMTP).
export default function PlatformSettingsPage() {
  const [form, setForm] = useState({ smtpHost: "", smtpPort: "587", smtpSecure: "true", smtpUsername: "", smtpPassword: "", smtpFromAddress: "", smtpFromName: "" });
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/platform/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load platform settings.");
      setForm({ smtpHost: body.smtpHost, smtpPort: String(body.smtpPort), smtpSecure: body.smtpSecure ? "true" : "false", smtpUsername: body.smtpUsername, smtpPassword: "", smtpFromAddress: body.smtpFromAddress, smtpFromName: body.smtpFromName });
      setSmtpConfigured(body.smtpConfigured);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load platform settings."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form, smtpPort: form.smtpPort ? Number(form.smtpPort) : null, smtpSecure: form.smtpSecure === "true" };
      const response = await fetch("/api/v1/platform/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save platform settings.");
      await load();
      setNotice("Platform settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save platform settings."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="table-state">Loading platform settings…</div>;

  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Platform Settings</h1><p>Configuration that applies across every company on this instance, not any one tenant.</p></div>
      </header>
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}
      <section className="detail-panel">
        <header>
          <div><h2>Password-reset email (SMTP)</h2><p>Used only to send &quot;forgot password&quot; reset links — separate from any company&apos;s own Email/SMTP settings, since a reset happens before a company is chosen.</p></div>
          <span className={smtpConfigured ? "status-pill tone-green" : "status-pill neutral"}>{smtpConfigured ? "Configured" : "Not configured"}</span>
        </header>
        <div className="drawer-fields">
          <label><span>SMTP host</span><input value={form.smtpHost} placeholder="smtp.example.com" onChange={(e) => setForm((c) => ({ ...c, smtpHost: e.target.value }))} /></label>
          <label><span>SMTP port</span><input type="number" min={1} max={65535} value={form.smtpPort} onChange={(e) => setForm((c) => ({ ...c, smtpPort: e.target.value }))} /></label>
          <label><span>Connection security</span>
            <select value={form.smtpSecure} onChange={(e) => setForm((c) => ({ ...c, smtpSecure: e.target.value }))}>
              <option value="true">TLS / SSL (port 465 typically)</option>
              <option value="false">STARTTLS or none (port 587/25 typically)</option>
            </select>
          </label>
          <label><span>SMTP username</span><input value={form.smtpUsername} onChange={(e) => setForm((c) => ({ ...c, smtpUsername: e.target.value }))} /></label>
          <label><span>SMTP password</span><input type="password" value={form.smtpPassword} placeholder={smtpConfigured ? "Leave blank to keep the current password" : ""} onChange={(e) => setForm((c) => ({ ...c, smtpPassword: e.target.value }))} /></label>
          <label><span>&quot;From&quot; email address</span><input value={form.smtpFromAddress} onChange={(e) => setForm((c) => ({ ...c, smtpFromAddress: e.target.value }))} /></label>
          <label><span>&quot;From&quot; display name</span><input value={form.smtpFromName} placeholder="Apollo X" onChange={(e) => setForm((c) => ({ ...c, smtpFromName: e.target.value }))} /></label>
        </div>
        <div className="header-actions" style={{ marginTop: 12 }}>
          <button type="button" className="gold-button" disabled={saving} onClick={() => void save()}><Save size={14} /> {saving ? "Saving…" : "Save"}</button>
        </div>
      </section>
    </div>
  );
}
