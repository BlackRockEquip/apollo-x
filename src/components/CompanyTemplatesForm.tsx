"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async settings loading intentionally mirrors CompanySettingsForm.tsx's own pattern */

import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";

// 2026-09-29 — user request: "Create a template tab under settings which
// allows me to edit the message/email sent to suppliers, add/edit a
// signature field, change sending from email address etc." Reads/writes
// the same CompanySettings row as CompanySettingsForm.tsx (GET
// /api/v1/company-settings for the read, since getCompanySettings already
// returns these columns in its settings spread) but saves through its own
// PATCH /api/v1/company-settings/email-templates endpoint rather than the
// Company/Branding form's PATCH /api/v1/company-settings — that one
// requires legalName and rewrites the whole branding form, which this tab
// has no business doing. The "from" address/name intentionally stay on the
// Company/Branding tab (see updateCompanyEmailTemplates's comment) — shown
// here read-only as a reminder of where mail will appear to come from.
type FormState = {
  rfqEmailSubject: string;
  rfqEmailBody: string;
  followupEmailSubject: string;
  followupEmailBody: string;
  emailSignature: string;
};

const DEFAULT_RFQ_SUBJECT = "Request for quote — Job {{jobNumber}}";
const DEFAULT_RFQ_BODY = [
  "Hi {{supplierName}},",
  "",
  "Could you please quote on the following parts for job {{jobNumber}} ({{machine}})?",
  "",
  "{{partsList}}",
  "",
  "Please reply with pricing and availability at your earliest convenience.",
].join("\n");
const DEFAULT_FOLLOWUP_SUBJECT = "Follow-up — outstanding parts for Job {{jobNumber}}";
const DEFAULT_FOLLOWUP_BODY = [
  "Hi {{supplierName}},",
  "",
  "Following up on the parts still outstanding for job {{jobNumber}}:",
  "",
  "{{partsList}}",
  "",
  "Please could you let us know an updated ETA for these?",
].join("\n");
const DEFAULT_SIGNATURE = "Thank you.";

export function CompanyTemplatesForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/company-settings", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Unable to load templates.");
    const s = body.settings || {};
    setForm({
      rfqEmailSubject: String(s.rfqEmailSubject || ""),
      rfqEmailBody: String(s.rfqEmailBody || ""),
      followupEmailSubject: String(s.followupEmailSubject || ""),
      followupEmailBody: String(s.followupEmailBody || ""),
      emailSignature: String(s.emailSignature || ""),
    });
    setFromAddress(String(s.smtpFromAddress || ""));
    setFromName(String(s.smtpFromName || ""));
  }

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load templates.")); }, []);

  async function onSave() {
    if (!form) return;
    setSaving(true); setError(""); setSuccessMessage("");
    try {
      const response = await fetch("/api/v1/company-settings/email-templates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save templates.");
      await load();
      setSuccessMessage("Templates saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save templates.");
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="table-state">{error || "Loading templates…"}</div>;

  return (
    <div style={{ display: "grid", gap: 14, padding: 20 }}>
      <section className="detail-panel">
        <header>
          <div><h2>Supplier emails</h2><p>Customize the RFQ request and parts follow-up emails sent to suppliers. Leave a field blank to use the default text shown as its placeholder.</p></div>
          <div className="header-actions"><button type="button" className="quiet-button" onClick={() => void load()}><RotateCcw size={14} /> Reset</button><button type="button" className="gold-button" disabled={saving} onClick={() => void onSave()}><Save size={14} /> {saving ? "Saving…" : "Save"}</button></div>
        </header>
        {error ? <div className="inline-error">{error}</div> : null}
        {successMessage ? <div className="inline-success">{successMessage}</div> : null}
        <div className="drawer-fields">
          <label className="wide"><span>Sending from</span><input value={fromName || fromAddress ? `${fromName ? `${fromName} ` : ""}${fromAddress ? `<${fromAddress}>` : ""}`.trim() : "Not set — configure under Company / Branding"} readOnly disabled /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header><div><h2>Quote request (RFQ)</h2><p>Sent when a part is sent to a supplier for a quote, or resent via Retry. Placeholders: <code>{"{{supplierName}}"}</code>, <code>{"{{jobNumber}}"}</code>, <code>{"{{machine}}"}</code>, <code>{"{{partsList}}"}</code>.</p></div></header>
        <div className="drawer-fields">
          <label className="wide"><span>Subject</span><input value={form.rfqEmailSubject} placeholder={DEFAULT_RFQ_SUBJECT} onChange={(e) => setForm((current) => current ? { ...current, rfqEmailSubject: e.target.value } : current)} /></label>
          <label className="wide"><span>Message</span><textarea rows={9} value={form.rfqEmailBody} placeholder={DEFAULT_RFQ_BODY} onChange={(e) => setForm((current) => current ? { ...current, rfqEmailBody: e.target.value } : current)} /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header><div><h2>Parts follow-up</h2><p>Sent when chasing a supplier for outstanding ordered parts. Placeholders: <code>{"{{supplierName}}"}</code>, <code>{"{{jobNumber}}"}</code>, <code>{"{{partsList}}"}</code>.</p></div></header>
        <div className="drawer-fields">
          <label className="wide"><span>Subject</span><input value={form.followupEmailSubject} placeholder={DEFAULT_FOLLOWUP_SUBJECT} onChange={(e) => setForm((current) => current ? { ...current, followupEmailSubject: e.target.value } : current)} /></label>
          <label className="wide"><span>Message</span><textarea rows={9} value={form.followupEmailBody} placeholder={DEFAULT_FOLLOWUP_BODY} onChange={(e) => setForm((current) => current ? { ...current, followupEmailBody: e.target.value } : current)} /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header><div><h2>Signature</h2><p>Appended to the end of both emails above, after a blank line.</p></div></header>
        <div className="drawer-fields">
          <label className="wide"><span>Signature</span><textarea rows={4} value={form.emailSignature} placeholder={DEFAULT_SIGNATURE} onChange={(e) => setForm((current) => current ? { ...current, emailSignature: e.target.value } : current)} /></label>
        </div>
      </section>
    </div>
  );
}
