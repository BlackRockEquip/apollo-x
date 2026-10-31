"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async settings loading intentionally mirrors CompanySettingsForm.tsx's own pattern */

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Clock, FileText, Info, Mail, MessageSquare, PenLine, RotateCcw, Save, Table2 } from "lucide-react";
import { useTenantPermissions } from "@/components/AppShell";
import {
  EMAIL_FIELD_GROUPS,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_GROUPS,
  ccProblem,
  emailSampleValues,
  isDefaultWording,
  parseCcList,
  previewParts,
  templateFieldKeys,
  unknownFields,
  type EmailTemplateKey,
} from "@/lib/email-template-fields";

// 2026-09-29 — user request: "Create a template tab under settings which allows me to edit the message/email sent to suppliers,
// add/edit a signature field, change sending from email address etc." Reads/writes the same CompanySettings row as
// CompanySettingsForm.tsx (GET /api/v1/company-settings for the read) but saves through its own PATCH
// /api/v1/company-settings/email-templates endpoint. The "from" address/name stay on the Company / Branding tab - shown here
// read-only as a reminder of where mail will appear to come from.
//
// 2026-10-30, user request: "mockup a better looking ui for this page" + "build it into the system". Three columns: the list of
// templates, an editor (with a searchable "Insert a field" panel), and a live preview with example job details. Every template
// starts with its default wording written out in full; wording that is still exactly the default is saved as "not customised".

// cc: addresses copied on every email of the template (2026-10-31, user request: "add fields on the template for emails to be cc'd").
type Wording = { subject: string; body: string; cc: string };
type Wordings = Record<EmailTemplateKey, Wording>;

type TemplateInfo = {
  key: EmailTemplateKey;
  name: string;
  short: string;
  description: string;
  when: string;
  icon: ReactNode;
  to: string;
  attachment?: string;
};

const TEMPLATES: TemplateInfo[] = [
  { key: "rfq", name: "Quote request (RFQ)", short: "Asks a supplier to quote on parts", icon: <MessageSquare size={17} />, to: "supplier@example.com",
    description: "Sent when a part is sent to a supplier for a quote, or resent with Retry.",
    when: "Goes to the supplier you pick on the Parts tab, with your signature added at the end." },
  { key: "followup", name: "Parts follow-up", short: "Chases outstanding ordered parts", icon: <Clock size={17} />, to: "supplier@example.com",
    description: "Sent when chasing a supplier for parts that are still outstanding.",
    when: "Sent from the Parts follow-up list, one email per supplier, with your signature added at the end." },
  { key: "wip", name: "Jobs & WIP table email", short: "Emails the table as a PDF", icon: <Table2 size={17} />, to: "recipient@example.com", attachment: "Jobs-WIP-2026-10-30.pdf",
    description: "Sent by the Email button on the Jobs & WIP table.",
    when: "The table, as it is filtered on screen, is attached as a PDF. Your signature is added at the end." },
  { key: "signature", name: "Signature", short: "Added to the end of every email", icon: <PenLine size={17} />, to: "supplier@example.com",
    description: "Added after a blank line at the end of every email above.",
    when: "Applies to all templates, so you only write it once." },
];

const SECTIONS: Array<{ label: string; keys: EmailTemplateKey[] }> = [
  { label: "To suppliers", keys: ["rfq", "followup"] },
  { label: "Internal", keys: ["wip"] },
  { label: "All emails", keys: ["signature"] },
];

type SettingsKey = "rfqEmailCc" | "followupEmailCc" | "wipEmailCc" | "rfqEmailSubject" | "rfqEmailBody" | "followupEmailSubject" | "followupEmailBody" | "wipEmailSubject" | "wipEmailBody" | "emailSignature";

const SAMPLE = emailSampleValues();

// Stored wording is empty when a template was never customised; the editor shows the default wording written out in full instead.
function fromSettings(s: Record<string, unknown>): Wordings {
  const text = (key: SettingsKey) => String(s[key] ?? "").trim();
  const d = EMAIL_TEMPLATE_DEFAULTS;
  return {
    rfq: { subject: text("rfqEmailSubject") || d.rfq.subject, body: text("rfqEmailBody") || d.rfq.body, cc: text("rfqEmailCc") },
    followup: { subject: text("followupEmailSubject") || d.followup.subject, body: text("followupEmailBody") || d.followup.body, cc: text("followupEmailCc") },
    wip: { subject: text("wipEmailSubject") || d.wip.subject, body: text("wipEmailBody") || d.wip.body, cc: text("wipEmailCc") },
    signature: { subject: "", body: text("emailSignature") || d.signature.body, cc: "" },
  };
}

function toPayload(w: Wordings): Record<SettingsKey, string> {
  return {
    rfqEmailSubject: w.rfq.subject, rfqEmailBody: w.rfq.body,
    followupEmailSubject: w.followup.subject, followupEmailBody: w.followup.body,
    wipEmailSubject: w.wip.subject, wipEmailBody: w.wip.body,
    emailSignature: w.signature.body,
    rfqEmailCc: w.rfq.cc, followupEmailCc: w.followup.cc, wipEmailCc: w.wip.cc,
  };
}

const sameWording = (a: Wording, b: Wording) => a.subject === b.subject && a.body === b.body && a.cc === b.cc;

// Template text with its {{fields}} replaced by the example values and highlighted.
function Filled({ text, values }: { text: string; values: Record<string, string> }) {
  return (
    <>
      {previewParts(text, values).map((part, i) =>
        part.field ? <mark key={i} title={`{{${part.field}}}`}>{part.text || `{{${part.field}}}`}</mark> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

export function CompanyTemplatesForm() {
  // 2026-10-20: the supplier (RFQ / follow-up) templates only matter when RFQs is on; the Jobs & WIP table email is always available.
  const { moduleAccess } = useTenantPermissions();
  const rfqEnabled = (moduleAccess.get("PROCUREMENT") ?? "DENIED") !== "DENIED";
  const templates = useMemo(() => TEMPLATES.filter((t) => rfqEnabled || (t.key !== "rfq" && t.key !== "followup")), [rfqEnabled]);

  const [saved, setSaved] = useState<Wordings | null>(null);
  const [current, setCurrent] = useState<Wordings | null>(null);
  const [selected, setSelected] = useState<EmailTemplateKey>("rfq");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  const pendingCursor = useRef<{ field: "subject" | "body"; at: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/company-settings", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Unable to load templates.");
    const wordings = fromSettings(body.settings || {});
    setSaved(wordings);
    setCurrent(wordings);
    setFromAddress(String(body.settings?.smtpFromAddress || ""));
    setFromName(String(body.settings?.smtpFromName || ""));
  }, []);

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load templates.")); }, [load]);

  // Start on a template this company can use (the supplier templates are hidden when RFQs is off).
  useEffect(() => {
    if (!templates.some((t) => t.key === selected)) setSelected(templates[0].key);
  }, [templates, selected]);

  // After a field is inserted the cursor goes right after it.
  useLayoutEffect(() => {
    const pending = pendingCursor.current;
    if (!pending) return;
    pendingCursor.current = null;
    const element = pending.field === "subject" ? subjectRef.current : bodyRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(pending.at, pending.at);
  });

  const template = templates.find((t) => t.key === selected) ?? templates[0];
  // A CC box with something that is not an address stops the save (shown under that box).
  const ccErrors = current ? templates.filter((t) => ccProblem(current[t.key].cc)).map((t) => t.name) : [];
  const isSignature = template.key === "signature";
  const dirtyKeys = useMemo(
    () => (saved && current ? templates.filter((t) => !sameWording(current[t.key], saved[t.key])).map((t) => t.key) : []),
    [saved, current, templates],
  );

  const setWording = (key: EmailTemplateKey, patch: Partial<Wording>) => setCurrent((c) => (c ? { ...c, [key]: { ...c[key], ...patch } } : c));

  function insertField(name: string) {
    if (!current) return;
    const field = isSignature ? "body" : lastField.current;
    const element = field === "subject" ? subjectRef.current : bodyRef.current;
    const token = `{{${name}}}`;
    const value = current[template.key][field];
    // An empty box means "use the default", so inserting into it starts from the default wording.
    const hasText = value.trim() !== "";
    const text = hasText ? value : EMAIL_TEMPLATE_DEFAULTS[template.key][field];
    const start = hasText ? (element?.selectionStart ?? text.length) : text.length;
    const end = hasText ? (element?.selectionEnd ?? text.length) : text.length;
    const lead = start > 0 && !/\s$/.test(text.slice(0, start)) ? " " : "";
    pendingCursor.current = { field, at: start + lead.length + token.length };
    setWording(template.key, { [field]: text.slice(0, start) + lead + token + text.slice(end) });
  }

  function resetToDefault() {
    const defaults = EMAIL_TEMPLATE_DEFAULTS[template.key];
    // The CC list is not wording, so it stays.
    setWording(template.key, { subject: defaults.subject, body: defaults.body });
  }

  async function onSave() {
    if (!current || ccErrors.length > 0) return;
    setSaving(true); setError(""); setSuccessMessage("");
    try {
      const response = await fetch("/api/v1/company-settings/email-templates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(current)) });
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

  if (!current || !saved) return <div className="table-state">{error || "Loading templates…"}</div>;

  const wording = current[template.key];
  const defaults = EMAIL_TEMPLATE_DEFAULTS[template.key];
  const shownSubject = (wording.subject.trim() ? wording.subject : defaults.subject).replace(/\s+/g, " ").trim();
  const shownBody = wording.body.trim() ? wording.body : defaults.body;
  const signatureText = current.signature.body.trim() ? current.signature.body : EMAIL_TEMPLATE_DEFAULTS.signature.body;
  const unknown = unknownFields(template.key, shownSubject, shownBody);
  const q = query.trim().toLowerCase();
  const groups = EMAIL_TEMPLATE_GROUPS[template.key]
    .map((groupKey) => {
      const group = EMAIL_FIELD_GROUPS[groupKey];
      return { group, fields: group.fields.filter((f) => !q || f.key.toLowerCase().includes(q) || f.hint.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)) };
    })
    .filter((g) => g.fields.length > 0);
  const sampleRows = templateFieldKeys(template.key).map((key) => [key, SAMPLE[key] ?? ""] as const);
  const stateOf = (key: EmailTemplateKey): ["dirty" | "cus" | "def", string] =>
    dirtyKeys.includes(key) ? ["dirty", "Unsaved"] : !isDefaultWording(key, current[key].subject, current[key].body) || current[key].cc.trim() ? ["cus", "Customised"] : ["def", "Default"];
  const [stateClass, stateLabel] = stateOf(template.key);
  const atDefault = wording.subject === defaults.subject && wording.body === defaults.body;
  const fromLabel = fromName || fromAddress;
  const ccProblemText = isSignature ? "" : ccProblem(wording.cc);
  const ccShown = isSignature ? [] : parseCcList(wording.cc).valid;

  return (
    <div className="tpl-page">
      <div className="tpl-from">
        <div className="tpl-from-icon"><Mail size={18} /></div>
        <div className="tpl-from-text">
          <small>Emails are sent from</small>
          {fromLabel ? <><strong>{fromLabel}</strong> {fromName && fromAddress ? <span>&lt;{fromAddress}&gt;</span> : null}</> : <strong>Not set yet - add the sending address in Company / Branding</strong>}
        </div>
        <Link className="quiet-button" href="/settings">Change in Company / Branding</Link>
      </div>

      {error ? <div className="inline-error tpl-banner">{error}</div> : null}
      {successMessage ? <div className="inline-success tpl-banner">{successMessage}</div> : null}

      <div className="tpl-work">
        <section className="tpl-card">
          <header><div><h2>Templates</h2><p>Click one to edit it</p></div></header>
          <div className="tpl-list">
            {SECTIONS.map((section) => {
              const items = templates.filter((t) => section.keys.includes(t.key));
              if (items.length === 0) return null;
              return (
                <Fragment key={section.label}>
                  <div className="tpl-list-label">{section.label}</div>
                  {items.map((t) => {
                    const [cls, label] = stateOf(t.key);
                    return (
                      <button key={t.key} type="button" className={`tpl-item${t.key === template.key ? " on" : ""}`} onClick={() => { setSelected(t.key); setQuery(""); }}>
                        <span className="tpl-item-icon">{t.icon}</span>
                        <span><b>{t.name}</b><small>{t.short}</small></span>
                        <span className={`tpl-pill ${cls}`}><i />{label}</span>
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </section>

        <section className="tpl-card">
          <header>
            <div><h2>{template.name}</h2><p>{template.description}</p></div>
            <span className={`tpl-pill ${stateClass}`}><i />{stateLabel}</span>
          </header>
          <div className="tpl-editor">
            <div className="tpl-when"><Info size={15} /><span>{template.when}</span></div>

            {!isSignature && (
              <div className="tpl-field">
                <label className="tpl-label" htmlFor="tpl-subject">Subject <span>shown in the recipient&apos;s inbox</span></label>
                <input id="tpl-subject" ref={subjectRef} type="text" autoComplete="off" value={wording.subject} placeholder={defaults.subject}
                  onFocus={() => { lastField.current = "subject"; }} onChange={(e) => setWording(template.key, { subject: e.target.value })} />
              </div>
            )}

            {!isSignature && (
              <div className="tpl-field">
                <label className="tpl-label" htmlFor="tpl-cc">CC <span>copied on every email sent from this template - separate addresses with commas</span></label>
                <input id="tpl-cc" type="text" autoComplete="off" inputMode="email" value={wording.cc} placeholder="e.g. workshop@company.co.za, accounts@company.co.za"
                  aria-invalid={ccProblemText ? true : undefined} onChange={(e) => setWording(template.key, { cc: e.target.value })} />
                {ccProblemText ? <div className="tpl-field-error">{ccProblemText}</div> : null}
              </div>
            )}

            <div className="tpl-field">
              <label className="tpl-label" htmlFor="tpl-body">{isSignature ? "Signature" : "Message"} <span>{isSignature ? "plain text, keep it short" : "starts with the default wording - edit it, or reset it below"}</span></label>
              <textarea id="tpl-body" ref={bodyRef} className={isSignature ? "short" : ""} value={wording.body} placeholder={defaults.body}
                onFocus={() => { lastField.current = "body"; }} onChange={(e) => setWording(template.key, { body: e.target.value })} />
            </div>

            {unknown.length > 0 && (
              <div className="tpl-warn"><Info size={15} /><span>{unknown.map((name) => `{{${name}}}`).join(", ")} {unknown.length === 1 ? "is not a field this email can fill in, so it would be sent blank." : "are not fields this email can fill in, so they would be sent blank."}</span></div>
            )}

            <div className="tpl-fields">
              <div className="tpl-fields-head">
                <div><b>Insert a field</b><span>{isSignature ? "Click one to put it where your cursor is." : "Click one to put it where your cursor is (subject or message)."}</span></div>
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a field, e.g. serial" autoComplete="off" />
              </div>
              <div className="tpl-fields-groups">
                {groups.length === 0 ? <div className="tpl-fields-none">No field matches &quot;{query}&quot;.</div> : groups.map(({ group, fields }) => (
                  <div key={group.key} className="tpl-group">
                    <h4>{group.label}</h4>
                    <div className="tpl-chips">
                      {fields.map((f) => (
                        <button key={f.key} type="button" className="tpl-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insertField(f.key)}>
                          <Highlight text={`{{${f.key}}}`} query={query} /><em><Highlight text={f.hint} query={query} /></em>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tpl-tools">
              <button type="button" className="quiet-button" onClick={resetToDefault} disabled={atDefault}><RotateCcw size={13} /> Reset to default wording</button>
              <span className="tpl-count">{shownBody.length} characters</span>
            </div>
          </div>
        </section>

        <section className="tpl-card tpl-preview">
          <header><div><h2>Preview</h2><p>With example job details</p></div><span className="tpl-pill cus"><i />Live</span></header>
          <div className="tpl-mail">
            <div className="tpl-mail-bar">
              <div><b>From</b><span>{fromLabel || "Your company"}</span></div>
              <div><b>To</b><span>{template.to}</span></div>
              {ccShown.length > 0 && <div><b>Cc</b><span>{ccShown.join(", ")}</span></div>}
              <div className="tpl-mail-subject"><Filled text={isSignature ? EMAIL_TEMPLATE_DEFAULTS.rfq.subject : shownSubject} values={SAMPLE} /></div>
            </div>
            <div className="tpl-mail-body">
              {isSignature ? <span className="tpl-mail-note">… the email&apos;s message …</span> : <Filled text={shownBody} values={SAMPLE} />}
              {"\n\n"}
              <Filled text={signatureText} values={SAMPLE} />
            </div>
          </div>
          {template.attachment && <div className="tpl-attachment"><FileText size={15} /><span><b>{template.attachment}</b> · attached automatically</span></div>}
          <details className="tpl-sample">
            <summary>Example values used in the preview</summary>
            <dl>
              {sampleRows.map(([key, value]) => (<Fragment key={key}><dt>{`{{${key}}}`}</dt><dd>{value}</dd></Fragment>))}
            </dl>
          </details>
        </section>
      </div>

      <div className={`tpl-savebar${dirtyKeys.length > 0 ? " show" : ""}`} aria-hidden={dirtyKeys.length === 0}>
        <div className="tpl-savebar-msg">
          <span className="tpl-pill dirty"><i />Unsaved changes</span>
          <span>{dirtyKeys.length > 0 ? `· ${templates.filter((t) => dirtyKeys.includes(t.key)).map((t) => t.name).join(", ")}` : ""}</span>
        </div>
        <div className="tpl-savebar-actions">
          <button type="button" className="quiet-button" disabled={saving} onClick={() => { setCurrent(saved); setError(""); }}>Discard</button>
          <button type="button" className="gold-button" disabled={saving || ccErrors.length > 0} title={ccErrors.length > 0 ? `Fix the CC addresses first: ${ccErrors.join(", ")}` : undefined} onClick={() => void onSave()}><Save size={14} /> {saving ? "Saving…" : "Save templates"}</button>
        </div>
      </div>
    </div>
  );
}
